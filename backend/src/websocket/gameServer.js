// Authoritative server-side game state
const gameStates = new Map(); // lobbyId -> { players: { [userId]: { ... } }, bullets: [ { id, position, velocity, rotation, shooterId, ... } ] }
const playerInputs = new Map(); // lobbyId -> { [userId]: latestInput }

// Game loop interval (ms)
const TICK_RATE = 50; // 20 times per second
import { getLobby, updateLobby } from '../config/redis.js';
import pool from '../config/database.js';

// Store active WebSocket connections
const connections = new Map(); // lobbyId -> Set of ws connections
const userSockets = new Map(); // userId -> ws connection

// Store all WebSocket connections (for lobby browser updates)
const allClients = new Set();

export function setupWebSocketServer(wss) {
  wss.on('connection', (ws) => {
    allClients.add(ws);
    console.log('New WebSocket connection');

    let currentLobbyId = null;
    let currentUserId = null;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'join_game':
            await handleJoinGame(ws, message, wss);
            currentLobbyId = message.lobbyId;
            currentUserId = message.userId;
            break;

              case 'player_input':
                handlePlayerInput(ws, message, currentLobbyId);
                break;

          case 'kill':
            await handleKill(message, currentLobbyId);
            break;

          case 'start_game':
            await handleStartGame(message.lobbyId);
            break;

          case 'end_game':
            await handleEndGame(message.lobbyId, message.results);
            break;

          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    });

    ws.on('close', () => {
      allClients.delete(ws);
      console.log('WebSocket connection closed');
      if (currentLobbyId && connections.has(currentLobbyId)) {
        connections.get(currentLobbyId).delete(ws);
        if (connections.get(currentLobbyId).size === 0) {
          connections.delete(currentLobbyId);
        }
      }
      if (currentUserId) {
        userSockets.delete(currentUserId);
        // Remove player from server game state
        if (currentLobbyId && gameStates.has(currentLobbyId)) {
          const state = gameStates.get(currentLobbyId);
          if (state.players && state.players[currentUserId]) {
            delete state.players[currentUserId];
          }
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
}

async function handleJoinGame(ws, message, wss) {
  const { lobbyId, userId, username } = message;

  // Add connection to lobby
  if (!connections.has(lobbyId)) {
    connections.set(lobbyId, new Set());
  }
  connections.get(lobbyId).add(ws);
  userSockets.set(userId, ws);


  // Initialize game state for this lobby if not present
  if (!gameStates.has(lobbyId)) {
    gameStates.set(lobbyId, { players: {}, bullets: [] });
  }
  // Add player to game state if not present
  const state = gameStates.get(lobbyId);
  if (!state.players[userId]) {
    state.players[userId] = {
      position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      health: 100,
      speed: 200,
      username
    };
  }
  // Get full player list for this lobby
  const lobby = await getLobby(lobbyId);
  const playerList = lobby && lobby.players ? lobby.players : [userId];

  // Send confirmation and player list to the joining player
  ws.send(JSON.stringify({
    type: 'joined',
    lobbyId,
    userId,
    players: playerList
  }));

  // Broadcast to all players in lobby
  broadcast(lobbyId, {
    type: 'player_joined',
    userId,
    username
  }, ws);

  console.log(`Player ${username} joined lobby ${lobbyId}`);
}

async function handleGameState(ws, message, lobbyId) {
  // Broadcast game state to all players except sender
  if (lobbyId) {
    broadcast(lobbyId, {
      type: 'game_state',
      state: message.state,
      timestamp: Date.now()
    }, ws);
  }
}


function handlePlayerInput(ws, message, lobbyId) {
  // Store latest input for this player
  if (!lobbyId || !message.userId) return;
  if (!playerInputs.has(lobbyId)) playerInputs.set(lobbyId, {});
  playerInputs.get(lobbyId)[message.userId] = message.input;

  // Handle shoot input
  if (message.input && message.input.shoot) {
    const state = gameStates.get(lobbyId);
    if (state) {
      // Create a bullet with unique id
      const bulletId = Date.now().toString() + Math.floor(Math.random() * 10000);
      const shooter = state.players[message.userId];
      if (shooter) {
        const pos = message.input.shoot.position;
        const rot = message.input.shoot.rotation;
        const speed = 600; // Example bullet speed
        state.bullets.push({
          id: bulletId,
          position: { x: pos.x, y: pos.y },
          velocity: { x: Math.cos(rot) * speed, y: Math.sin(rot) * speed },
          rotation: rot,
          shooterId: message.userId,
          createdAt: Date.now()
        });
      }
    }
  }
}

// Main game loop for all lobbies
setInterval(() => {
  for (const [lobbyId, state] of gameStates.entries()) {
    const inputs = playerInputs.get(lobbyId) || {};
    // Update each player's state based on their input
    for (const userId in state.players) {
      const input = inputs[userId];
      if (input) {
        // Example: input = { move: {x, y}, rotation, shoot }
        // Update position, rotation, etc. (simple physics)
        const player = state.players[userId];
        if (input.move) {
          player.velocity = input.move;
          player.position.x += player.velocity.x * (TICK_RATE / 1000) * player.speed;
          player.position.y += player.velocity.y * (TICK_RATE / 1000) * player.speed;
        }
        if (typeof input.rotation === 'number') {
          player.rotation = input.rotation;
        }
      }
    }
    // Update bullets
    const dt = TICK_RATE / 1000;
    const now = Date.now();
    // Move bullets
    for (const bullet of state.bullets) {
      bullet.position.x += bullet.velocity.x * dt;
      bullet.position.y += bullet.velocity.y * dt;
    }
    // Remove bullets after 2 seconds (lifetime)
    state.bullets = state.bullets.filter(bullet => now - bullet.createdAt < 2000);
    // Broadcast updated state to all clients
    broadcast(lobbyId, {
      type: 'game_state',
      state,
      timestamp: Date.now()
    });
  }
}, TICK_RATE);

async function handleKill(message, lobbyId) {
  const { killerId, victimId, sessionId } = message;

  try {
    // Update game participants
    await pool.query(
      'UPDATE game_participants SET kills = kills + 1 WHERE session_id = $1 AND user_id = $2',
      [sessionId, killerId]
    );

    await pool.query(
      'UPDATE game_participants SET deaths = deaths + 1 WHERE session_id = $1 AND user_id = $2',
      [sessionId, victimId]
    );

    // Broadcast kill event
    if (lobbyId) {
      broadcast(lobbyId, {
        type: 'kill',
        killerId,
        victimId,
        timestamp: Date.now()
      });
    }

  } catch (error) {
    console.error('Kill tracking error:', error);
  }
}

async function handleStartGame(lobbyId) {
  try {
    // Update lobby status
    await updateLobby(lobbyId, { status: 'in_progress' });

    // Update database
    await pool.query(
      'UPDATE game_sessions SET status = $1, started_at = NOW() WHERE lobby_id = $2',
      ['in_progress', lobbyId]
    );

    // Get session ID
    const result = await pool.query(
      'SELECT id FROM game_sessions WHERE lobby_id = $1',
      [lobbyId]
    );

    if (result.rows.length > 0) {
      const sessionId = result.rows[0].id;

      // Add participants
      const lobby = await getLobby(lobbyId);
      for (const userId of lobby.players) {
        await pool.query(
          'INSERT INTO game_participants (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [sessionId, userId]
        );
      }
    }

    // Broadcast game start
    broadcast(lobbyId, {
      type: 'game_started',
      lobbyId,
      timestamp: Date.now()
    });

    console.log(`Game started in lobby ${lobbyId}`);

  } catch (error) {
    console.error('Start game error:', error);
  }
}

async function handleEndGame(lobbyId, results) {
  try {
    // Update game session
    await pool.query(
      'UPDATE game_sessions SET status = $1, ended_at = NOW() WHERE lobby_id = $2',
      ['finished', lobbyId]
    );

    // Get session ID
    const sessionResult = await pool.query(
      'SELECT id FROM game_sessions WHERE lobby_id = $1',
      [lobbyId]
    );

    if (sessionResult.rows.length > 0) {
      const sessionId = sessionResult.rows[0].id;

      // Update player stats
      for (const result of results) {
        const { userId, kills, deaths, placement } = result;

        // Update game participants
        await pool.query(
          'UPDATE game_participants SET kills = $1, deaths = $2, placement = $3 WHERE session_id = $4 AND user_id = $5',
          [kills, deaths, placement, sessionId, userId]
        );

        // Update player stats
        const isWinner = placement === 1;
        await pool.query(
          `UPDATE player_stats
           SET total_kills = total_kills + $1,
               total_deaths = total_deaths + $2,
               total_games = total_games + 1,
               wins = wins + $3
           WHERE user_id = $4`,
          [kills, deaths, isWinner ? 1 : 0, userId]
        );
      }
    }

    // Broadcast game end
    broadcast(lobbyId, {
      type: 'game_ended',
      results,
      timestamp: Date.now()
    });

    console.log(`Game ended in lobby ${lobbyId}`);

  } catch (error) {
    console.error('End game error:', error);
  }
}


function broadcast(lobbyId, message, excludeWs = null) {
  if (!connections.has(lobbyId)) return;

  const data = JSON.stringify(message);
  connections.get(lobbyId).forEach((client) => {
    if (client !== excludeWs && client.readyState === 1) { // OPEN state
      client.send(data);
    }
  });
}

// Broadcast to all connected clients (for lobby list updates)
function broadcastLobbyListUpdate() {
  const data = JSON.stringify({ type: 'lobby_list_updated', timestamp: Date.now() });
  allClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

export { connections, userSockets, broadcast, broadcastLobbyListUpdate };
