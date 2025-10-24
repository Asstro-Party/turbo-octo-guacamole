// Authoritative server-side game state
// Simple async job queue for DB writes
const dbQueue = [];
let processingDb = false;
async function processDbQueue() {
  if (processingDb) return;
  processingDb = true;
  while (dbQueue.length) {
    const job = dbQueue.shift();
    try { await job(); } catch (e) { console.error('DB job failed', e); }
  }
  processingDb = false;
}
const gameStates = new Map(); // lobbyId -> { players: { [userId]: { ... } }, bullets: [ { id, position, velocity, rotation, shooterId, ... } ] }
const playerInputs = new Map(); // lobbyId -> { [userId]: latestInput }

// Game loop interval (ms)
const TICK_RATE = 50; // ~20 times per second (20 FPS)
import { getLobby, updateLobby } from '../config/redis.js';
import pool from '../config/database.js';

// Store active WebSocket connections
const connections = new Map(); // lobbyId -> Set of ws connections
const userSockets = new Map(); // userId -> ws connection

// Voice chat readiness per lobby: lobbyId -> Set(userId)
const voiceReady = new Map();

// ===== ICE CONFIG =====
// NEW: local-only switch to bypass STUN/TURN entirely for LAN/dev tests.
// If true, we return { iceServers: [] } and don't try to contact any STUN/TURN.
// Set LOCAL_ONLY_WEBRTC=true in your env for local testing.
const LOCAL_ONLY_WEBRTC = String(process.env.LOCAL_ONLY_WEBRTC || '').toLowerCase() === 'true';

// Kept for non-local mode (production/dev with STUN/TURN)
const STUN_POOL = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
  'stun:stun4.l.google.com:19302'
];
const TURN_URLS = ['turn:turn.local:3478'];

function iceServersForLobby(lobbyId) {
  // Local-only path: no STUN/TURN
  if (LOCAL_ONLY_WEBRTC) {
    const config = {
      iceServers: [],
      // Keep policy 'all' so browsers gather host/mDNS candidates (good for same-machine or LAN)
      iceTransportPolicy: 'all',
      // Some stacks benefit from small pool for faster local ICE; optional:
      iceCandidatePoolSize: 0
    };
    try {
      console.log('[ICE CONFIG][LOCAL ONLY]', JSON.stringify({
        iceServers: [],
        iceTransportPolicy: config.iceTransportPolicy
      }));
    } catch {}
    return config;
  }

  // === Original behavior (with STUN/TURN) ===
  let sum = 0;
  for (let i = 0; i < String(lobbyId).length; i++) sum = (sum + String(lobbyId).charCodeAt(i)) | 0;
  const perLobbyStun = STUN_POOL[Math.abs(sum) % STUN_POOL.length];

  const parseList = (s) => (s ? String(s).split(',').map((t) => t.trim()).filter(Boolean) : []);

  const stunUrls = [perLobbyStun, 'stun:stun.l.google.com:19302', ...parseList(process.env.STUN_URLS)];

  const turnUrls = (() => {
    const fromEnv = parseList(process.env.TURN_URLS);
    return fromEnv.length ? fromEnv : TURN_URLS;
  })();
  const turnUsername = process.env.TURN_USERNAME || 'myuser';
  const turnCredential =
    process.env.TURN_PASSWORD ||
    process.env.TURN_SECRET ||
    process.env.TURN_CREDENTIAL ||
    'mypassword';
  const includeTurn = turnUrls.length > 0 && !!turnUsername && !!turnCredential;

  const iceServers = [
    ...stunUrls.map((u) => ({ urls: u })),
    ...(includeTurn ? turnUrls.map((u) => ({ urls: u, username: turnUsername, credential: turnCredential })) : [])
  ];

  const forceTurn = String(process.env.FORCE_TURN || '').toLowerCase() === 'true';
  const iceTransportPolicy = forceTurn ? 'relay' : 'all';

  // Avoid logging credentials
  try {
    const safeLog = {
      iceServers: iceServers.map((e) => ({ urls: e.urls, hasAuth: !!e.username })),
      iceTransportPolicy
    };
    console.log('[ICE CONFIG]', JSON.stringify(safeLog));
  } catch {}

  return { iceServers, iceTransportPolicy };
}

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
            await handleStartGame(ws, message.lobbyId, currentUserId);
            break;

          case 'end_game':
            await handleEndGame(message.lobbyId, message.results);
            break;

          case 'host_return_to_waiting':
            await handleHostReturnToWaiting(message.lobbyId, currentUserId);
            break;

          // WebRTC signaling passthrough
          case 'webrtc_offer':
            await handleWebRTCOffer(ws, message, currentLobbyId);
            break;
          case 'webrtc_answer':
            await handleWebRTCAnswer(ws, message, currentLobbyId);
            break;
          case 'webrtc_ice_candidate':
            await handleICECandidate(ws, message, currentLobbyId);
            break;

          // Voice readiness gating
          case 'voice_ready': {
            if (!currentLobbyId || !currentUserId) break;
            if (!voiceReady.has(currentLobbyId)) voiceReady.set(currentLobbyId, new Set());
            voiceReady.get(currentLobbyId).add(currentUserId);
            // Broadcast updated voice state to lobby
            broadcast(currentLobbyId, {
              type: 'voice_ready_state',
              lobbyId: currentLobbyId,
              userId: currentUserId,
              readyUsers: Array.from(voiceReady.get(currentLobbyId))
            });
            break;
          }

          // Provide per-lobby ICE servers (now respects LOCAL_ONLY_WEBRTC)
          case 'get_ice_servers': {
            const lobbyId = message.lobbyId || currentLobbyId;
            const config = iceServersForLobby(lobbyId);
            ws.send(JSON.stringify({ type: 'ice_servers', lobbyId, config }));
            break;
          }

          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    });

    ws.on('close', async () => {
      allClients.delete(ws);
      console.log('WebSocket connection closed for user:', currentUserId);
      if (currentLobbyId && connections.has(currentLobbyId)) {
        connections.get(currentLobbyId).delete(ws);
        if (connections.get(currentLobbyId).size === 0) {
          connections.delete(currentLobbyId);
        }
      }
      if (currentUserId) {
        // Only delete from userSockets if this is actually their current socket
        if (userSockets.get(currentUserId) === ws) {
          userSockets.delete(currentUserId);
        }
        // Remove player from server game state
        if (currentLobbyId && gameStates.has(currentLobbyId)) {
          const state = gameStates.get(currentLobbyId);
          if (state.players && state.players[currentUserId]) {
            delete state.players[currentUserId];
          }
        }
        // Clear voice ready status for this user
        if (currentLobbyId && voiceReady.has(currentLobbyId)) {
          voiceReady.get(currentLobbyId).delete(currentUserId);
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
      username,
      kills: 0,
      deaths: 0
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

  try {
    const lobby = await getLobby(lobbyId);
    if (lobby && lobby.playerModels) {
      ws.send(JSON.stringify({
        type: 'player_model_state',
        lobbyId,
        playerModels: lobby.playerModels
      }));
    }
  } catch (error) {
    console.error('Failed to send player model state:', error);
  }

  // Immediately broadcast the current game state to all clients so everyone sees all players
  broadcast(lobbyId, {
    type: 'game_state',
    state: gameStates.get(lobbyId),
    timestamp: Date.now()
  });

  console.log(`Player ${username} joined lobby ${lobbyId}`);
}

// --- WebRTC signaling helpers ---
async function handleWebRTCOffer(ws, message, lobbyId) {
  const { targetUserId, offer } = message;
  console.log('[WS] webrtc_offer from', message.fromUserId, 'to', targetUserId, 'lobby', lobbyId);
  const targetWs = userSockets.get(targetUserId);
  if (targetWs && targetWs.readyState === 1) {
    targetWs.send(JSON.stringify({
      type: 'webrtc_offer',
      fromUserId: message.fromUserId,
      offer
    }));
  } else {
    console.warn('[WS] webrtc_offer target not available for', targetUserId);
  }
}

async function handleWebRTCAnswer(ws, message, lobbyId) {
  const { targetUserId, answer } = message;
  console.log('[WS] webrtc_answer from', message.fromUserId, 'to', targetUserId, 'lobby', lobbyId);
  const targetWs = userSockets.get(targetUserId);
  if (targetWs && targetWs.readyState === 1) {
    targetWs.send(JSON.stringify({
      type: 'webrtc_answer',
      fromUserId: message.fromUserId,
      answer
    }));
  } else {
    console.warn('[WS] webrtc_answer target not available for', targetUserId);
  }
}

async function handleICECandidate(ws, message, lobbyId) {
  const { targetUserId, candidate } = message;
  // Avoid logging entire candidate string to keep logs tidy
  console.debug('[WS] ice_candidate from', message.fromUserId, 'to', targetUserId, 'lobby', lobbyId);
  const targetWs = userSockets.get(targetUserId);
  if (targetWs && targetWs.readyState === 1) {
    targetWs.send(JSON.stringify({
      type: 'webrtc_ice_candidate',
      fromUserId: message.fromUserId,
      candidate
    }));
  } else {
    console.warn('[WS] ice_candidate target not available for', targetUserId);
  }
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
        const speed = 600;
        const bulletObj = {
          id: bulletId,
          position: { x: pos.x, y: pos.y },
          velocity: { x: Math.cos(rot) * speed, y: Math.sin(rot) * speed },
          rotation: rot,
          shooterId: message.userId,
          createdAt: Date.now()
        };
        state.bullets.push(bulletObj);
      }
    }
  }
}

// Game configuration
const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

// Main game loop for all lobbies
// Calculates new player positions, handles collisions, and broadcasts state
let tickCount = 0;
setInterval(() => {
  const now = Date.now();
  const dt = TICK_RATE / 1000;

  for (const [lobbyId, state] of gameStates.entries()) {
    const inputs = playerInputs.get(lobbyId) || {};
    let stateChanged = false;

    // Update each player's state based on their input
    for (const userId in state.players) {
      const input = inputs[userId];
      const player = state.players[userId];

      // Defensive: ensure player has position, rotation, and speed
      if (!player.position) player.position = { x: 100, y: 100 };
      if (typeof player.rotation !== 'number') player.rotation = 0;
      if (typeof player.speed !== 'number') player.speed = 200;

      const oldX = player.position.x;
      const oldY = player.position.y;
      const oldRot = player.rotation;

      if (input) {
        // Apply incremental clockwise rotation if present
        if (typeof input.rotation === 'number') {
          const rotationSpeed = player.rotationSpeed || Math.PI; // radians/sec
          player.rotation += input.rotation * rotationSpeed * dt;
        }
      }

      // Always apply forward velocity in direction of player.rotation
      const forwardSpeed = player.forwardSpeed || player.speed * 0.5;
      player.position.x += Math.cos(player.rotation) * forwardSpeed * dt;
      player.position.y += Math.sin(player.rotation) * forwardSpeed * dt;

      // Wrap around screen edges
      player.position.x = (player.position.x + GAME_WIDTH) % GAME_WIDTH;
      player.position.y = (player.position.y + GAME_HEIGHT) % GAME_HEIGHT;

      // Track if player state changed
      if (
        player.position.x !== oldX ||
        player.position.y !== oldY ||
        player.rotation !== oldRot
      ) {
        stateChanged = true;
      }
    }

    // Update bullets - use in-place filtering for better performance
    let writeIdx = 0;
    for (let readIdx = 0; readIdx < state.bullets.length; readIdx++) {
      const bullet = state.bullets[readIdx];
      bullet.position.x += bullet.velocity.x * dt;
      bullet.position.y += bullet.velocity.y * dt;

      // Remove bullets that go off screen or are too old
      if (bullet.position.x < 0 || bullet.position.x > GAME_WIDTH ||
          bullet.position.y < 0 || bullet.position.y > GAME_HEIGHT ||
          now - bullet.createdAt > 2000) {
        stateChanged = true;
        continue; // Skip this bullet (effectively removes it)
      }

      // Keep this bullet
      if (writeIdx !== readIdx) {
        state.bullets[writeIdx] = bullet;
      }
      writeIdx++;
    }
    state.bullets.length = writeIdx;

    // Server-side collision detection
    const HIT_RADIUS = 20; // pixels
    const DAMAGE = 50;
    const HIT_RADIUS_SQ = HIT_RADIUS * HIT_RADIUS;

    for (let bi = state.bullets.length - 1; bi >= 0; bi--) {
      const bullet = state.bullets[bi];
      // defensive checks
      if (!bullet || !bullet.position || typeof bullet.shooterId === 'undefined') continue;

      let bulletHit = false;
      for (const pidStr in state.players) {
        const pid = parseInt(pidStr);
        if (pid === bullet.shooterId) continue; // don't hit shooter
        const player = state.players[pidStr];
        if (!player || !player.position) continue;

        const dx = bullet.position.x - player.position.x;
        const dy = bullet.position.y - player.position.y;
        if (dx * dx + dy * dy <= HIT_RADIUS_SQ) {
          // Hit detected — apply damage
          player.health = (typeof player.health === 'number' ? player.health : 100) - DAMAGE;
          stateChanged = true;

          // Remove the bullet
          state.bullets.splice(bi, 1);

          // Handle player death
          if (player.health <= 0) {
            // Update in-memory stats
            if (!state.players[bullet.shooterId]) {
              state.players[bullet.shooterId] = {
                kills: 0, deaths: 0, health: 100,
                position: { x: 100, y: 100 },
                rotation: 0,
                velocity: { x: 0, y: 0 },
                speed: 200
              };
            }
            state.players[bullet.shooterId].kills = (state.players[bullet.shooterId].kills || 0) + 1;
            player.deaths = (player.deaths || 0) + 1;

            // Broadcast kill event to lobby
            broadcast(lobbyId, {
              type: 'kill',
              killerId: bullet.shooterId,
              victimId: pid,
              timestamp: now
            });

            // Check for win condition (5 kills)
            if (state.players[bullet.shooterId].kills >= 5) {
              // Game over - someone won!
              handleGameOver(lobbyId, bullet.shooterId);
            } else {
              // Respawn player (reset health and reuse position object)
              player.health = 100;
              if (!player.position) player.position = { x: 0, y: 0 };
              player.position.x = Math.random() * 400 + 100;
              player.position.y = Math.random() * 400 + 100;
            }
          }

          // Bullet handled, stop checking other players for this bullet
          bulletHit = true;
          break;
        }
      }

      // If bullet was removed by hit, skip to next bullet
      if (bulletHit) continue;
    }

    // Only broadcast if state changed or every 3rd tick to reduce network load
    if (stateChanged || tickCount % 3 === 0) {
      broadcast(lobbyId, {
        type: 'game_state',
        state,
        timestamp: now
      });
    }
  }
  tickCount++;
}, TICK_RATE);

async function handleKill(message, lobbyId) {
  const { killerId, victimId, sessionId } = message;

  // Debug: log incoming kill payload and socket mapping
  console.log('[gameServer] handleKill called with:', { killerId, victimId, sessionId, lobbyId });
  console.log('[gameServer] userSockets has killerId?', userSockets.has(killerId));

  try {
    // Minimal server-side verification
    const MAX_BULLET_AGE_MS = 500; // how old a bullet may be and still considered valid
    const MAX_HIT_DISTANCE = 48; // pixels

    if (!lobbyId || !gameStates.has(lobbyId)) {
      console.log('[gameServer] handleKill: no game state for lobby', lobbyId);
      return; // ignore invalid report
    }

    const state = gameStates.get(lobbyId);
    if (!state.players || !state.players[victimId]) {
      console.log('[gameServer] handleKill: victim not found in state', victimId);
      return;
    }

    const victimPos = state.players[victimId].position;
    const now = Date.now();

    // Find a matching bullet
    const matchingBullet = (state.bullets || []).find(b => {
      try {
        if (b.shooterId != killerId) return false;
        if (!b.position || typeof b.createdAt !== 'number') return false;
        if (now - b.createdAt > MAX_BULLET_AGE_MS) return false;
        const dx = (b.position.x || 0) - (victimPos.x || 0);
        const dy = (b.position.y || 0) - (victimPos.y || 0);
        const dist2 = dx * dx + dy * dy;
        return dist2 <= (MAX_HIT_DISTANCE * MAX_HIT_DISTANCE);
      } catch (e) {
        return false;
      }
    });

    if (!matchingBullet) {
      console.log('[gameServer] handleKill: no matching bullet found — rejecting kill report', { killerId, victimId, lobbyId });
      return; // reject the kill report silently
    }

    dbQueue.push(() => pool.query(
      'UPDATE game_participants SET kills = kills + 1 WHERE session_id = $1 AND user_id = $2',
      [sessionId, killerId]
    ));
    dbQueue.push(() => pool.query(
      'UPDATE game_participants SET deaths = deaths + 1 WHERE session_id = $1 AND user_id = $2',
      [sessionId, victimId]
    ));
    processDbQueue();

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

async function handleStartGame(ws, lobbyId, requesterUserId) {
  try {
    // Voice readiness gate: all players must be ready
    const lobby = await getLobby(lobbyId);
    const players = lobby?.players || [];
    const readySet = voiceReady.get(lobbyId) || new Set();
    const allReady = players.every((pid) => readySet.has(pid));
    if (!allReady) {
      const waitingFor = players.filter((pid) => !readySet.has(pid));
      // Notify requester (host) and lobby
      const notice = {
        type: 'voice_waiting',
        lobbyId,
        waitingFor,
        readyUsers: Array.from(readySet)
      };
      try { ws?.send(JSON.stringify(notice)); } catch {}
      broadcast(lobbyId, notice);
      return; // do not start yet
    }

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
      const lobby2 = await getLobby(lobbyId);
      for (const userId of lobby2.players) {
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

async function handleGameOver(lobbyId, winnerId) {
  try {
    const state = gameStates.get(lobbyId);
    if (!state) return;

    // Prepare results array with player stats
    const results = [];
    const playerList = Object.keys(state.players);

    for (const playerIdStr of playerList) {
      const playerId = parseInt(playerIdStr);
      const player = state.players[playerIdStr];
      results.push({
        userId: playerId,
        kills: player.kills || 0,
        deaths: player.deaths || 0,
        placement: playerId === winnerId ? 1 : 2,
        username: player.username || `Player ${playerId}`
      });
    }

    // Sort by kills (descending) for proper placement
    results.sort((a, b) => b.kills - a.kills);
    results.forEach((result, index) => {
      result.placement = index + 1;
    });

    // Update database
    const sessionResult = await pool.query(
      'SELECT id FROM game_sessions WHERE lobby_id = $1',
      [lobbyId]
    );

    if (sessionResult.rows.length > 0) {
      const sessionId = sessionResult.rows[0].id;

      // Update game session status
      await pool.query(
        'UPDATE game_sessions SET status = $1, ended_at = NOW() WHERE lobby_id = $2',
        ['finished', lobbyId]
      );

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

    // Update lobby status and reset player models
    const lobby = await getLobby(lobbyId);
    console.log('[handleGameOver] Lobby data:', JSON.stringify(lobby, null, 2));
    if (lobby) {
      lobby.status = 'waiting';
      // Reset player models so they can select again
      if (lobby.playerModels) {
        for (const playerId in lobby.playerModels) {
          lobby.playerModels[playerId] = null;
        }
      }
      await updateLobby(lobbyId, lobby);
    }

    console.log('[handleGameOver] Broadcasting game_over with hostUserId:', lobby?.hostUserId);

    // Broadcast game over
    broadcast(lobbyId, {
      type: 'game_over',
      winnerId,
      results,
      hostUserId: lobby?.hostUserId,
      timestamp: Date.now()
    });

    console.log(`Game over in lobby ${lobbyId}. Winner: ${winnerId}`);

  } catch (error) {
    console.error('Game over error:', error);
  }
}

async function handleHostReturnToWaiting(lobbyId, userId) {
  try {
    const lobby = await getLobby(lobbyId);

    if (!lobby) {
      console.log('handleHostReturnToWaiting: Lobby not found');
      return;
    }

    // Verify the user is the host
    if (lobby.hostUserId !== userId) {
      console.log('handleHostReturnToWaiting: User is not the host');
      return;
    }

    // Get updated lobby state
    const updatedLobby = await getLobby(lobbyId);

    // Broadcast return to waiting room
    broadcast(lobbyId, {
      type: 'return_to_waiting',
      lobbyId,
      playerModels: updatedLobby?.playerModels || {},
      timestamp: Date.now()
    });

    // Clean up game state
    gameStates.delete(lobbyId);
    playerInputs.delete(lobbyId);
    voiceReady.delete(lobbyId);

    console.log(`Host ${userId} returned lobby ${lobbyId} to waiting room`);

  } catch (error) {
    console.error('Host return to waiting error:', error);
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
