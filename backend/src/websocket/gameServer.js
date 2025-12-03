// Authoritative server-side game state using Lobby, Game, and Player objects
import { Lobby } from '../models/Lobby.js';
import { getLobby, updateLobby } from '../config/redis.js';
import pool from '../config/database.js';

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

// Store lobbies
const lobbies = new Map(); // lobbyId -> Lobby instance

// Store all WebSocket connections (for lobby browser updates)
const allClients = new Set();

// Game loop interval (ms)
const TICK_RATE = 50; // ~20 times per second (20 FPS)

// Connection timeout management
const VOICE_TIMEOUT_MS = 300000; // 5 minutes of inactivity
setInterval(() => {
  for (const lobby of lobbies.values()) {
    lobby.cleanupStaleVoice(VOICE_TIMEOUT_MS);
  }
}, 60000); // Check every minute

// ICE servers for WebRTC
const ICE_SERVERS = (() => {
  try {
    return process.env.WEBRTC_ICE_SERVERS ? JSON.parse(process.env.WEBRTC_ICE_SERVERS) : [
      { urls: 'stun:stun.l.google.com:19302' }
    ];
  } catch (e) {
    console.error('[voice] Failed to parse WEBRTC_ICE_SERVERS, using default STUN:', e);
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
})();

/**
 * Get or create a lobby
 * @param {string} lobbyId - Lobby ID
 * @returns {Lobby} Lobby instance
 */
function getOrCreateLobby(lobbyId) {
  if (!lobbies.has(lobbyId)) {
    lobbies.set(lobbyId, new Lobby(lobbyId));
  }
  return lobbies.get(lobbyId);
}

/**
 * Build peer init hint for WebRTC
 * @param {number} selfId - Self user ID
 * @param {number} otherId - Other user ID
 * @returns {boolean} True if self should initiate
 */
function buildPeerInitHint(selfId, otherId) {
  try {
    const aNum = Number(selfId);
    const bNum = Number(otherId);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum < bNum;
    return String(selfId) < String(otherId);
  } catch {
    return String(selfId) < String(otherId);
  }
}

/**
 * Setup WebSocket server
 * @param {WebSocketServer} wss - WebSocket server instance
 */
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

          case 'player_teleported':
            handlePlayerTeleported(message, currentLobbyId);
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

          case 'host_return_to_waiting':
            await handleHostReturnToWaiting(message.lobbyId, currentUserId);
            break;

          case "play_sound":
            handlePlaySound(ws, message);
            break;

          case 'pickup_powerup':
            handlePowerupPickup(message, currentLobbyId);
            break;

          case 'use_powerup':
            handlePowerupUse(message, currentLobbyId);
            break;

          // =============== VOICE: simple-peer signalling ==================
          case 'joined_voice': {
            const { roomId, userId } = message;
            console.log(`[WebRTC] Received joined_voice:`, { roomId, userId });
            if (!userId || !roomId) {
              console.log(`[WebRTC] ERROR: Missing userId or roomId in joined_voice`);
              break;
            }
            await handleJoinedVoice(roomId, userId);
            break;
          }

          case 'leave_voice': {
            const { roomId, userId } = message;
            console.log(`[WebRTC] Received leave_voice:`, { roomId, userId });
            if (!userId || !roomId) {
              console.log(`[WebRTC] ERROR: Missing userId or roomId in leave_voice`);
              break;
            }
            await handleLeaveVoice(roomId, userId);
            break;
          }

          case 'voice_signal': {
            const { roomId, fromUserId, toUserId, data: sig } = message;
            console.log(`[WebRTC] Received voice_signal:`, { roomId, fromUserId, toUserId, signalType: sig?.type });
            if (!roomId || !fromUserId || !toUserId || !sig) {
              console.log(`[WebRTC] ERROR: Missing required fields in voice_signal`);
              break;
            }
            await handleVoiceSignal({ roomId, fromUserId, toUserId, data: sig });
            break;
          }

          case 'request_voice_peers': {
            const { roomId, userId } = message;
            console.log(`[WebRTC] User ${userId} requesting peers for room ${roomId}`);

            const lobby = lobbies.get(roomId);
            const peers = lobby ? lobby.getVoiceMembers(userId) : [];

            console.log(`[WebRTC] Room ${roomId} peers for ${userId}:`, peers);
            console.log(`[WebRTC] ICE servers:`, ICE_SERVERS);

            if (lobby) {
              lobby.sendToUser(userId, {
                type: 'voice_peer_list',
                roomId,
                peers: peers.map(pid => ({ userId: pid, initiatorHint: buildPeerInitHint(userId, pid) })),
                iceServers: ICE_SERVERS,
              });
            }
            break;
          }

          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        try { ws.send(JSON.stringify({ type: 'error', message: error.message })); } catch { }
      }
    });

    ws.on('close', async () => {
      allClients.delete(ws);
      console.log('WebSocket connection closed for user:', currentUserId);

      // Voice cleanup if the user was in a voice room
      if (currentUserId && currentLobbyId) {
        const lobby = lobbies.get(currentLobbyId);
        if (lobby && lobby.isInVoice(currentUserId)) {
          console.log(`[WebRTC] Cleaning up voice for disconnected user ${currentUserId} in lobby ${currentLobbyId}`);
          await handleLeaveVoice(currentLobbyId, currentUserId);
        }
      }

      // Remove connection from lobby
      if (currentLobbyId) {
        const lobby = lobbies.get(currentLobbyId);
        if (lobby) {
          lobby.removeConnection(ws, currentUserId);

          // Clean up empty in-memory lobby
          // Note: We do NOT delete from Redis here because players might reconnect
          // Redis lobbies are only deleted via the explicit /leave API endpoint
          if (lobby.isEmpty()) {
            lobbies.delete(currentLobbyId);
            console.log(`[Lobby ${currentLobbyId}] Deleted from memory (empty, players can still reconnect)`);
          }
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
}

/**
 * Handle join game message
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Join game message
 * @param {WebSocketServer} wss - WebSocket server
 */
async function handleJoinGame(ws, message, _wss) {
  const { lobbyId, userId, username } = message;

  console.log(`[WebRTC] handleJoinGame - User ${userId} joining lobby ${lobbyId}`);

  // Get lobby info to verify membership
  const lobbyInfo = await getLobby(lobbyId);

  // Check if user is a member of the lobby
  if (!lobbyInfo || !lobbyInfo.players || !lobbyInfo.players.includes(userId)) {
    console.log(`User ${userId} not in lobby ${lobbyId} - rejecting join_game`);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Not a member of this lobby'
    }));
    return;
  }

  // Get or create lobby
  const lobby = getOrCreateLobby(lobbyId);

  // Add connection to lobby
  lobby.addConnection(ws, userId);

  // Get the default game
  const game = lobby.getDefaultGame();

  // Get player list from lobby info
  const playerList = lobbyInfo.players;

  // Add player to game if not already present
  if (!game.getPlayer(userId)) {
    const spawnIndex = playerList.indexOf(userId);
    game.addPlayer(userId, username, spawnIndex);
  }

  // Send confirmation and player list to the joining player
  ws.send(JSON.stringify({
    type: 'joined',
    lobbyId,
    userId,
    players: playerList,
    walls: game.walls,
  }));

  // Broadcast to all players in lobby
  lobby.broadcast({
    type: 'player_joined',
    userId,
    username
  }, ws);

  try {
    const lobbyInfo = await getLobby(lobbyId);
    if (lobbyInfo && lobbyInfo.playerModels) {
      ws.send(JSON.stringify({
        type: 'player_model_state',
        lobbyId,
        playerModels: lobbyInfo.playerModels
      }));
    }
  } catch (error) {
    console.error('Failed to send player model state:', error);
  }

  // Immediately broadcast the current game state to all clients
  lobby.broadcast({
    type: 'game_state',
    state: game.getState(),
    timestamp: Date.now()
  });

  console.log(`Player ${username} joined lobby ${lobbyId}`);
}

/**
 * Handle player input
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Player input message
 * @param {string} lobbyId - Lobby ID
 */
function handlePlayerInput(ws, message, lobbyId) {
  if (!lobbyId || !message.userId) return;

  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  const game = lobby.getDefaultGame();
  if (!game) return;

  game.handlePlayerInput(message.userId, message.input);
}

/**
 * Handle player teleported
 * @param {Object} message - Teleport message
 * @param {string} lobbyId - Lobby ID
 */
function handlePlayerTeleported(message, lobbyId) {
  if (!lobbyId || !message.userId) return;

  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  const game = lobby.getDefaultGame();
  if (!game) return;

  game.teleportPlayer(message.userId, message.position);
}

/**
 * Handle powerup pickup
 * @param {Object} message - Pickup message
 * @param {string} lobbyId - Lobby ID
 */
function handlePowerupPickup(message, lobbyId) {
  if (!lobbyId) return;
  
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  
  const game = lobby.getDefaultGame();
  if (!game) return;
  
  const success = game.handlePowerupPickup(message.userId, message.powerupId);
  
  if (success) {
    lobby.broadcast({
      type: 'powerup_collected',
      userId: message.userId,
      powerupId: message.powerupId
    });
  }
}

/**
 * Handle powerup use
 * @param {Object} message - Use powerup message
 * @param {string} lobbyId - Lobby ID
 */
function handlePowerupUse(message, lobbyId) {
  if (!lobbyId) return;
  
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  
  const game = lobby.getDefaultGame();
  if (!game) return;
  
  game.handlePowerupUse(message.userId, message.data, (event) => {
    lobby.broadcast(event);
  });
}

/**
 * Handle kill event
 * @param {Object} message - Kill message
 * @param {string} lobbyId - Lobby ID
 */
async function handleKill(message, lobbyId) {
  const { killerId, victimId, sessionId } = message;

  console.log('[gameServer] handleKill called with:', { killerId, victimId, sessionId, lobbyId });

  try {
    const MAX_BULLET_AGE_MS = 500;
    const MAX_HIT_DISTANCE = 48;

    if (!lobbyId || !lobbies.has(lobbyId)) {
      console.log('[gameServer] handleKill: no lobby found', lobbyId);
      return;
    }

    const lobby = lobbies.get(lobbyId);
    const game = lobby.getDefaultGame();

    if (!game) {
      console.log('[gameServer] handleKill: no game found in lobby', lobbyId);
      return;
    }

    const victim = game.getPlayer(victimId);
    if (!victim) {
      console.log('[gameServer] handleKill: victim not found', victimId);
      return;
    }

    const victimPos = victim.position;
    const now = Date.now();

    // Find a matching bullet
    const matchingBullet = (game.bullets || []).find(b => {
      try {
        if (b.shooterId != killerId) return false;
        if (!b.position || typeof b.createdAt !== 'number') return false;
        if (now - b.createdAt > MAX_BULLET_AGE_MS) return false;
        const dx = (b.position.x || 0) - (victimPos.x || 0);
        const dy = (b.position.y || 0) - (victimPos.y || 0);
        const dist2 = dx * dx + dy * dy;
        return dist2 <= (MAX_HIT_DISTANCE * MAX_HIT_DISTANCE);
      } catch (e) {
        console.error('Error in handleKill bullet matching:', e);
        return false;
      }
    });

    if (!matchingBullet) {
      console.log('[gameServer] handleKill: no matching bullet found — rejecting kill report');
      return;
    }

    // NOTE: In-memory kill/death counters are updated by server-side collision detection
    // in Game.js:handleBulletPlayerCollisions(). This function only updates the database
    // for persistence. Client-reported kills are validated but not used for game state.

    // Update database for persistence
    dbQueue.push(() => pool.query(
      'UPDATE game_participants SET kills = kills + 1 WHERE session_id = $1 AND user_id = $2',
      [sessionId, killerId]
    ));
    dbQueue.push(() => pool.query(
      'UPDATE game_participants SET deaths = deaths + 1 WHERE session_id = $1 AND user_id = $2',
      [sessionId, victimId]
    ));
    processDbQueue();

    console.log(`[gameServer] Validated kill: ${killerId} -> ${victimId}, updated database`);

  } catch (error) {
    console.error('Kill tracking error:', error);
  }
}

/**
 * Handle start game
 * @param {string} lobbyId - Lobby ID
 */
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
      const lobbyInfo = await getLobby(lobbyId);
      for (const userId of lobbyInfo.players) {
        await pool.query(
          'INSERT INTO game_participants (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [sessionId, userId]
        );
      }
    }

    // Broadcast game start
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      lobby.broadcast({
        type: 'game_started',
        lobbyId,
        timestamp: Date.now()
      });
    }

    console.log(`Game started in lobby ${lobbyId}`);

  } catch (error) {
    console.error('Start game error:', error);
  }
}

/**
 * Handle game over
 * @param {string} lobbyId - Lobby ID
 * @param {number} winnerId - Winner user ID
 */
async function handleGameOver(lobbyId, winnerId) {
  try {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;

    const game = lobby.getDefaultGame();
    if (!game) return;

    // Prepare results array with player stats
    const results = [];
    for (const [userId, player] of game.players) {
      results.push({
        userId: userId,
        kills: player.kills || 0,
        deaths: player.deaths || 0,
        placement: userId === winnerId ? 1 : 2,
        username: player.username || `Player ${userId}`
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
    const lobbyInfo = await getLobby(lobbyId);
    console.log('[handleGameOver] Lobby data:', JSON.stringify(lobbyInfo, null, 2));
    if (lobbyInfo) {
      lobbyInfo.status = 'waiting';
      // Reset player models so they can select again
      if (lobbyInfo.playerModels) {
        for (const playerId in lobbyInfo.playerModels) {
          lobbyInfo.playerModels[playerId] = null;
        }
      }
      await updateLobby(lobbyId, lobbyInfo);
    }

    console.log('[handleGameOver] Broadcasting game_over with hostUserId:', lobbyInfo?.hostUserId);

    // Broadcast game over
    lobby.broadcast({
      type: 'game_over',
      winnerId,
      results,
      hostUserId: lobbyInfo?.hostUserId,
      timestamp: Date.now()
    });

    console.log(`Game over in lobby ${lobbyId}. Winner: ${winnerId}`);

  } catch (error) {
    console.error('Game over error:', error);
  }
}

/**
 * Handle host return to waiting
 * @param {string} lobbyId - Lobby ID
 * @param {number} userId - User ID
 */
async function handleHostReturnToWaiting(lobbyId, userId) {
  try {
    const lobbyInfo = await getLobby(lobbyId);

    if (!lobbyInfo) {
      console.log('handleHostReturnToWaiting: Lobby not found');
      return;
    }

    // Verify the user is the host
    if (lobbyInfo.hostUserId !== userId) {
      console.log('handleHostReturnToWaiting: User is not the host');
      return;
    }

    // Get updated lobby state
    const updatedLobby = await getLobby(lobbyId);

    // Broadcast return to waiting room
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      lobby.broadcast({
        type: 'return_to_waiting',
        lobbyId,
        playerModels: updatedLobby?.playerModels || {},
        timestamp: Date.now()
      });
    }

    // Clean up game state - recreate the default game
    if (lobby) {
      lobby.deleteGame(lobby.defaultGameId);
      lobby.createGame(lobby.defaultGameId);
      // Remove from gameOverLobbies if present
      gameOverLobbies.delete(lobbyId);
    }

    console.log(`Host ${userId} returned lobby ${lobbyId} to waiting room`);

  } catch (error) {
    console.error('Host return to waiting error:', error);
  }
}

/**
 * Handle end game
 * @param {string} lobbyId - Lobby ID
 * @param {Array} results - Game results
 */
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
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      lobby.broadcast({
        type: 'game_ended',
        results,
        timestamp: Date.now()
      });
    }

    console.log(`Game ended in lobby ${lobbyId}`);

  } catch (error) {
    console.error('End game error:', error);
  }
}

/**
 * Handle play sound
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Play sound message
 */
function handlePlaySound(ws, message) {
  // Validate required fields
  if (!message.sound) return;

  // Determine which lobby the sender belongs to
  const lobbyId = ws.lobbyId;
  if (!lobbyId || !lobbies.has(lobbyId)) return;

  const lobby = lobbies.get(lobbyId);
  lobby.broadcast({
    type: "play_sound",
    sound: message.sound,
    position: message.position || null
  }, ws);
}

// ==========================
// Voice signalling handlers
// ==========================

/**
 * Handle user joined voice
 * @param {string} roomId - Room ID (lobbyId)
 * @param {number} userId - User ID
 */
export async function handleJoinedVoice(roomId, userId) {
  console.log(`[WebRTC] User ${userId} joining voice room ${roomId}`);
  console.log(`[WebRTC] ICE servers being sent to client:`, JSON.stringify(ICE_SERVERS));

  const lobby = getOrCreateLobby(roomId);
  lobby.joinVoice(userId);

  // Get existing peers
  const existing = lobby.getVoiceMembers(userId);
  console.log(`[WebRTC] Room ${roomId} existing peers:`, existing);

  lobby.sendToUser(userId, {
    type: 'voice_peer_list',
    roomId,
    peers: existing.map(pid => ({ userId: pid, initiatorHint: buildPeerInitHint(userId, pid) })),
    iceServers: ICE_SERVERS,
  });

  // Notify others
  console.log(`[WebRTC] Notifying existing peers in room ${roomId} about new user ${userId}`);
  lobby.broadcastVoice({
    type: 'voice_peer_joined',
    roomId,
    userId,
  }, userId);

  console.log(`[WebRTC] Room ${roomId} now has ${lobby.voiceRoom.size} members:`, Array.from(lobby.voiceRoom));
}

/**
 * Handle user left voice
 * @param {string} roomId - Room ID (lobbyId)
 * @param {number} userId - User ID
 */
export async function handleLeaveVoice(roomId, userId) {
  console.log(`[WebRTC] User ${userId} leaving voice room ${roomId}`);

  const lobby = lobbies.get(roomId);
  if (!lobby) {
    console.log(`[WebRTC] Room ${roomId} not found for user ${userId}`);
    return;
  }

  lobby.leaveVoice(userId);

  lobby.broadcastVoice({ type: 'voice_peer_left', roomId, userId });

  // Clean up empty in-memory lobby
  // Note: We do NOT delete from Redis here because players might reconnect
  // Redis lobbies are only deleted via the explicit /leave API endpoint
  if (lobby.isEmpty()) {
    lobbies.delete(roomId);
    console.log(`[Lobby ${roomId}] Deleted from memory (empty after voice leave, players can still reconnect)`);
  }
}

/**
 * Handle voice signal
 * @param {Object} params - Signal parameters
 */
export async function handleVoiceSignal({ roomId, fromUserId, toUserId, data }) {
  console.log(`[WebRTC] Signal from ${fromUserId} to ${toUserId} in room ${roomId}`);
  console.log(`[WebRTC] Signal type:`, data?.type || 'unknown');

  const lobby = lobbies.get(roomId);
  if (!lobby) {
    console.log(`[WebRTC] ERROR: Room ${roomId} not found`);
    return;
  }

  if (!lobby.isInVoice(fromUserId)) {
    console.log(`[WebRTC] ERROR: Sender ${fromUserId} not in room ${roomId}`);
    return;
  }

  if (!lobby.isInVoice(toUserId)) {
    console.log(`[WebRTC] ERROR: Recipient ${toUserId} not in room ${roomId}`);
    return;
  }

  console.log(`[WebRTC] Forwarding signal from ${fromUserId} to ${toUserId}`);
  lobby.sendToUser(toUserId, {
    type: 'voice_signal',
    roomId,
    fromUserId,
    data,
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

// Main game loop for all lobbies
let tickCount = 0;
let gameOverLobbies = new Set(); // Track lobbies that have ended

setInterval(() => {
  const now = Date.now();
  const dt = TICK_RATE / 1000;

  for (const [lobbyId, lobby] of lobbies.entries()) {
    // Skip lobbies that have ended
    if (gameOverLobbies.has(lobbyId)) {
      continue;
    }

    for (const [_gameId, game] of lobby.games) {
      // Broadcast callback for game events
      const broadcastCallback = (message) => {
        lobby.broadcast(message);
      };

      // Update game state
      const result = game.update(dt, broadcastCallback);

      // Handle game over - check if result is an object with gameOver property
      if (result && typeof result === 'object' && result.gameOver) {
        console.log(`[Game Loop] Game over detected in lobby ${lobbyId}, winner: ${result.winnerId}`);
        gameOverLobbies.add(lobbyId);
        handleGameOver(lobbyId, result.winnerId);
        // Remove from gameOverLobbies after 30 seconds to allow for rematch
        setTimeout(() => {
          gameOverLobbies.delete(lobbyId);
        }, 30000);
        continue; // Stop processing this game
      }

      // Broadcast game state if changed or every 3rd tick
      if (result === true || tickCount % 3 === 0) {
        lobby.broadcast({
          type: 'game_state',
          state: game.getState(),
          timestamp: now
        });
      }
    }
  }
  tickCount++;
}, TICK_RATE);

// Export for use in other modules
export const voiceRooms = new Map(); // Kept for backward compatibility
export { lobbies, broadcastLobbyListUpdate };

// Helper functions for backward compatibility
export function broadcast(lobbyId, message, excludeWs = null) {
  const lobby = lobbies.get(lobbyId);
  if (lobby) {
    lobby.broadcast(message, excludeWs);
  }
}

export const connections = new Map(); // Kept for backward compatibility
export const userSockets = new Map(); // Kept for backward compatibility
