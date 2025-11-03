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
const userSockets = new Map(); // userId -> Set of ws connections (user can have multiple: game + voice)

// Store all WebSocket connections (for lobby browser updates)
const allClients = new Set();

// ==========================
// WebRTC voice signalling state
// ==========================
export const voiceRooms = new Map(); // roomId (use lobbyId) -> Set<userId>
const voicePresence = new Map(); // userId -> { roomId, joinedAt }

// Connection timeout management
const VOICE_TIMEOUT_MS = 300000; // 5 minutes of inactivity
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [userId, presence] of voicePresence.entries()) {
    if (now - presence.joinedAt > VOICE_TIMEOUT_MS) {
      console.log(`[WebRTC] Cleaning up stale voice connection for user ${userId}`);
      handleLeaveVoice(presence.roomId, userId);
    }
  }
}, 60000); // Check every minute

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

function sendToUser(userId, payload) {
  console.log(`[WebRTC] sendToUser called for userId: ${userId} (type: ${typeof userId})`);

  let sockets = userSockets.get(userId);
  if (!sockets) {
    // Try type coercion
    sockets = userSockets.get(Number(userId)) || userSockets.get(String(userId));
  }

  if (!sockets || sockets.size === 0) {
    console.log(`[WebRTC] WARNING: No sockets found for user ${userId}`);
    console.log(`[WebRTC] userSockets keys:`, Array.from(userSockets.keys()));
    return;
  }

  console.log(`[WebRTC] Found ${sockets.size} socket(s) for user ${userId}`);
  let sentCount = 0;

  sockets.forEach(sock => {
    if (sock.readyState !== 1) {
      console.log(`[WebRTC] Skipping socket for user ${userId} - not ready (state: ${sock.readyState})`);
      return;
    }

    try {
      sock.send(JSON.stringify(payload));
      sentCount++;
    } catch (e) {
      console.error(`[WebRTC] ERROR: Failed to send to user ${userId}:`, e.message);
    }
  });

  console.log(`[WebRTC] Sent ${payload.type} to ${sentCount} socket(s) for user ${userId}`);
}

function broadcastVoice(roomId, payload, excludeUserId = null) {
  const members = voiceRooms.get(roomId);
  if (!members) return;
  for (const uid of members) {
    if (excludeUserId && uid === excludeUserId) continue;
    sendToUser(uid, payload);
  }
}

function ensureVoiceRoom(roomId) {
  if (!voiceRooms.has(roomId)) {
    console.log(`[WebRTC] Creating new voice room: ${roomId}`);
    voiceRooms.set(roomId, new Set());
  }
  return voiceRooms.get(roomId);
}

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
          case 'player_input':
            handlePlayerInput(ws, message, currentLobbyId);
            break;

          case 'player_teleported':
            // Handle player teleportation from portal
            if (currentLobbyId && message.userId) {
              const state = gameStates.get(currentLobbyId);
              if (state && state.players && state.players[message.userId]) {
                state.players[message.userId].position.x = message.position.x;
                state.players[message.userId].position.y = message.position.y;
                console.log(`[${currentLobbyId}] Player ${message.userId} teleported to (${message.position.x}, ${message.position.y})`);
              }
            }
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

            const room = voiceRooms.get(roomId);
            const peers = room ? Array.from(room).filter(id => id !== userId) : [];

            console.log(`[WebRTC] Room ${roomId} peers for ${userId}:`, peers);
            console.log(`[WebRTC] ICE servers:`, ICE_SERVERS);

            sendToUser(userId, {
              type: 'voice_peer_list',
              roomId,
              peers: peers.map(pid => ({ userId: pid, initiatorHint: buildPeerInitHint(userId, pid) })),
              iceServers: ICE_SERVERS,
            });
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
      if (currentUserId) {
        const p = voicePresence.get(currentUserId);
        if (p?.roomId) {
          console.log(`[WebRTC] Cleaning up voice for disconnected user ${currentUserId} in room ${p.roomId}`);
          await handleLeaveVoice(p.roomId, currentUserId);
        }
      }

      if (currentLobbyId && connections.has(currentLobbyId)) {
        connections.get(currentLobbyId).delete(ws);
        if (connections.get(currentLobbyId).size === 0) {
          connections.delete(currentLobbyId);
        }
      }
      if (currentUserId) {
        // Remove socket from user's set
        const userSocketSet = userSockets.get(currentUserId);
        if (userSocketSet) {
          userSocketSet.delete(ws);
          if (userSocketSet.size === 0) {
            userSockets.delete(currentUserId);
          }
        }

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

function initializeGameState(lobbyId) {
  if (gameStates.has(lobbyId)) return gameStates.get(lobbyId);
  
  const state = {
    players: {},
    bullets: [],
    walls: [
      // TOP-LEFT CORNER (2x2 square)
      { id: 0, position: { x: 130, y: 100 }, health: 100, isHorizontal: false },
      { id: 1, position: { x: 170, y: 100 }, health: 100, isHorizontal: false },
      { id: 2, position: { x: 130, y: 200 }, health: 100, isHorizontal: false },
      { id: 3, position: { x: 170, y: 200 }, health: 100, isHorizontal: false },
      
      // TOP-RIGHT CORNER (2x2 square)
      { id: 4, position: { x: 1110, y: 100 }, health: 100, isHorizontal: false },
      { id: 5, position: { x: 1150, y: 100 }, health: 100, isHorizontal: false },
      { id: 6, position: { x: 1110, y: 200 }, health: 100, isHorizontal: false },
      { id: 7, position: { x: 1150, y: 200 }, health: 100, isHorizontal: false },
      
      // BOTTOM-LEFT CORNER (2x2 square)
      { id: 8, position: { x: 130, y: 520 }, health: 100, isHorizontal: false },
      { id: 9, position: { x: 170, y: 520 }, health: 100, isHorizontal: false },
      { id: 10, position: { x: 130, y: 620 }, health: 100, isHorizontal: false },
      { id: 11, position: { x: 170, y: 620 }, health: 100, isHorizontal: false },
      
      // BOTTOM-RIGHT CORNER (2x2 square)
      { id: 12, position: { x: 1110, y: 520 }, health: 100, isHorizontal: false },
      { id: 13, position: { x: 1150, y: 520 }, health: 100, isHorizontal: false },
      { id: 14, position: { x: 1110, y: 620 }, health: 100, isHorizontal: false },
      { id: 15, position: { x: 1150, y: 620 }, health: 100, isHorizontal: false },
      
      // CENTER (2x2 square)
      { id: 16, position: { x: 620, y: 310 }, health: 100, isHorizontal: false },
      { id: 17, position: { x: 660, y: 310 }, health: 100, isHorizontal: false },
      { id: 18, position: { x: 620, y: 410 }, health: 100, isHorizontal: false },
      { id: 19, position: { x: 660, y: 410 }, health: 100, isHorizontal: false },
    ],
    portals: [],
    lastPortalSpawn: Date.now()
  };
  
  gameStates.set(lobbyId, state);
  return state;
}

async function handleJoinGame(ws, message, wss) {
  const { lobbyId, userId, username } = message;

  console.log(`[WebRTC] handleJoinGame - User ${userId} joining lobby ${lobbyId}`);

  // Add connection to lobby
  if (!connections.has(lobbyId)) {
    connections.set(lobbyId, new Set());
  }
  connections.get(lobbyId).add(ws);

  // Add socket to user's set of sockets
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(ws);

  console.log(`[WebRTC] User ${userId} now has ${userSockets.get(userId).size} socket(s)`);
  console.log(`[WebRTC] Total users in userSockets: ${userSockets.size}`);
  const state = initializeGameState(lobbyId);

  // Get lobby to determine player order
  const lobby = await getLobby(lobbyId);
  const playerList = lobby && lobby.players ? lobby.players : [userId];

  if (!state.players[userId]) {
    // Define fixed spawn positions for 4 players
    const spawnPositions = [
      { x: 200, y: 150 },   // Player 1: Top-Left
      { x: 1080, y: 150 },  // Player 2: Top-Right
      { x: 1080, y: 570 },  // Player 3: Bottom-Right
      { x: 200, y: 570 }    // Player 4: Bottom-Left
    ];
    
    const spawnIndex = playerList.indexOf(userId); 
    const spawnPos = spawnPositions[spawnIndex];
    
    state.players[userId] = {
      position: { x: spawnPos.x, y: spawnPos.y },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      health: 100,
      speed: 200,
      kills: 0,
      deaths: 0,
      username: username
    };
    console.log(`[gameServer] Initialized player ${userId} at spawn ${spawnIndex + 1} (${spawnPos.x}, ${spawnPos.y})`);
  }

  // Send confirmation and player list to the joining player
  ws.send(JSON.stringify({
    type: 'joined',
    lobbyId,
    userId,
    players: playerList,
    walls: state.walls,      
    portals: state.portals   
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
        if (!isFinite(rot) || isNaN(rot)) {
          console.warn('Invalid rotation received from client:', rot);
          return; // Don't create bullet with invalid rotation
        }
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

// Collision detection constants
const PLAYER_RADIUS = 25;
const WALL_WIDTH = 40;
const WALL_HEIGHT = 100;
const BULLET_RADIUS = 10;

/**
 * Check if a circle collides with a rectangle (AABB collision)
 * @param {Object} circle - {x, y, radius}
 * @param {Object} rect - {x, y, width, height}
 * @returns {boolean}
 */
function checkCircleRectCollision(circle, rect) {
  // Find the closest point on the rectangle to the circle's center
  const closestX = Math.max(rect.x - rect.width / 2, Math.min(circle.x, rect.x + rect.width / 2));
  const closestY = Math.max(rect.y - rect.height / 2, Math.min(circle.y, rect.y + rect.height / 2));
  
  // Calculate distance between circle's center and this closest point
  const distanceX = circle.x - closestX;
  const distanceY = circle.y - closestY;
  const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
  
  // Collision occurs if distance is less than circle's radius
  return distanceSquared < (circle.radius * circle.radius);
}

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
          
          // Normalize rotation to prevent infinity (keep between -2π and 2π)
          const TWO_PI = Math.PI * 2;
          while (player.rotation > TWO_PI) player.rotation -= TWO_PI;
          while (player.rotation < -TWO_PI) player.rotation += TWO_PI;
          
          // Ensure it's a valid number
          if (!isFinite(player.rotation)) {
            player.rotation = 0;
          }
        }
      }
      // Always apply forward velocity in direction of player.rotation
      const forwardSpeed = player.forwardSpeed || player.speed * 0.5;

      // Calculate new position
      const newX = player.position.x + Math.cos(player.rotation) * forwardSpeed * dt;
      const newY = player.position.y + Math.sin(player.rotation) * forwardSpeed * dt;
      
      // Check collision with walls
      let canMove = true;
      if (state.walls && state.walls.length > 0) {
        for (const wall of state.walls) {
          if (!wall || wall.health <= 0) continue;
          
          const collision = checkCircleRectCollision(
            { x: newX, y: newY, radius: PLAYER_RADIUS },
            { x: wall.position.x, y: wall.position.y, width: WALL_WIDTH, height: WALL_HEIGHT }
          );
          
          if (collision) {
            canMove = false;
            break;
          }
        }
      }
      
      // Only update position if no collision
      if (canMove) {
        player.position.x = newX;
        player.position.y = newY;
      } else {
        // Player hit a wall, keep old position
        stateChanged = true; // Still mark as changed to sync clients
      }
      // Defensive: ensure player has position, rotation, and speed
      if (!player.position) player.position = { x: 100, y: 100 };
      if (typeof player.rotation !== 'number') player.rotation = 0;
      if (typeof player.speed !== 'number') player.speed = 200;

      if (input) {
        // Apply incremental clockwise rotation if present
        if (typeof input.rotation === 'number') {
          const rotationSpeed = player.rotationSpeed || Math.PI; // radians/sec
          player.rotation += input.rotation * rotationSpeed * dt;
          
          // Normalize rotation to prevent infinity (keep between -2π and 2π)
          const TWO_PI = Math.PI * 2;
          while (player.rotation > TWO_PI) player.rotation -= TWO_PI;
          while (player.rotation < -TWO_PI) player.rotation += TWO_PI;
          
          // Ensure it's a valid number
          if (!isFinite(player.rotation)) {
            player.rotation = 0;
          }
        }
      }

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

      // CHECK BULLET-WALL COLLISION
      let bulletHitWall = false;
      if (state.walls && state.walls.length > 0) {
        for (let wi = state.walls.length - 1; wi >= 0; wi--) {
          const wall = state.walls[wi];
          if (!wall || wall.health <= 0) continue;
          
          const collision = checkCircleRectCollision(
            { x: bullet.position.x, y: bullet.position.y, radius: BULLET_RADIUS },
            { x: wall.position.x, y: wall.position.y, width: WALL_WIDTH, height: WALL_HEIGHT }
          );
          
          if (collision) {
            // Damage the wall
            wall.health -= 25; // Same as bullet damage
            console.log(`[${lobbyId}] Bullet hit wall ${wi}, health: ${wall.health}`);
            
            // Remove wall if destroyed
            if (wall.health <= 0) {
              console.log(`[${lobbyId}] Wall ${wall.id} destroyed!`);
              
              // Broadcast wall destruction
              broadcast(lobbyId, {
                type: 'wall_destroyed',
                wallId: wall.id
              });
              
              state.walls.splice(wi, 1);
            }
            
            bulletHitWall = true;
            stateChanged = true;
            break;
          }
        }
      }
      
      if (bulletHitWall) {
        continue; // Skip this bullet (effectively removes it)
      }

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

    // Server-side collision detection: check bullets against players and apply damage
    // Minimal authoritative hit detection to keep clients in sync.
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
              
              // Use fixed spawn positions
              const spawnPositions = [
                { x: 200, y: 100 },   // Top-Left
                { x: 1000, y: 100 },  // Top-Right
                { x: 1000, y: 620 },  // Bottom-Right
                { x: 200, y: 620 }    // Bottom-Left
              ];
              const playerIds = Object.keys(state.players);
              const playerIndex = playerIds.indexOf(String(pid));
              const spawnPos = spawnPositions[playerIndex % 4];
              player.position.x = spawnPos.x;
              player.position.y = spawnPos.y;
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
    // Portal spawning logic - spawn every 20 seconds if no portals exist
    const PORTAL_SPAWN_INTERVAL = 20000; // 20 seconds
    const PORTAL_LIFETIME = 15000; // 15 seconds
    
    if (!state.portals) state.portals = [];
    if (!state.lastPortalSpawn) state.lastPortalSpawn = now;

    if (state.portals.length === 0 && now - state.lastPortalSpawn > PORTAL_SPAWN_INTERVAL) {
      // Define fixed portal spawn locations that match the maze layout
      const portalSpawnLocations = [
        // Top left opening
        { x: 150, y: 100 },
        // Top right opening  
        { x: 1130, y: 100 },
        // Left middle opening
        { x: 100, y: 360 },
        // Right middle opening
        { x: 1180, y: 360 },
        // Bottom left opening
        { x: 150, y: 620 },
        // Bottom right opening
        { x: 1130, y: 620 },
        // Center gaps
        { x: 640, y: 100 },
        { x: 640, y: 620 }
      ];
      
      // Randomly select 2 different locations for the portal pair
      const shuffled = [...portalSpawnLocations].sort(() => Math.random() - 0.5);
      const portal1 = {
        id: 0,
        position: shuffled[0]
      };
      
      const portal2 = {
        id: 1,
        position: shuffled[1]
      };
      
      state.portals = [portal1, portal2];
      state.lastPortalSpawn = now;
      stateChanged = true;
      
      console.log(`[${lobbyId}] Spawned portals at:`, portal1.position, portal2.position);
      
      // Broadcast portal spawn immediately
      broadcast(lobbyId, {
        type: 'portals_spawned',
        portals: state.portals
      });
      
      // Schedule portal removal after 15 seconds
      setTimeout(() => {
        if (gameStates.has(lobbyId)) {
          const currentState = gameStates.get(lobbyId);
          currentState.portals = [];
          console.log(`[${lobbyId}] Removed portals`);
          
          broadcast(lobbyId, {
            type: 'portals_removed'
          });
        }
      }, PORTAL_LIFETIME);
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
    // Minimal server-side verification to avoid obvious spoofing:
    // Verify there exists a recent bullet in the authoritative game state
    // that was fired by the claimed killer and is close to the victim's server position.
    const MAX_BULLET_AGE_MS = 500; // how old a bullet may be and still considered valid
    const MAX_HIT_DISTANCE = 48; // pixels (tweak as needed for your game scale)

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

function handlePlaySound(ws, message) {
  // Validate required fields
  if (!message.sound) return;

  // Determine which lobby the sender belongs to
  const lobbyId = ws.lobbyId;
  if (!lobbyId || !lobbies[lobbyId]) return;

  // Broadcast to everyone except the sender
  lobbies[lobbyId].forEach(player => {
    if (player !== ws && player.readyState === WebSocket.OPEN) {
      player.send(JSON.stringify({
        type: "play_sound",
        sound: message.sound,
        position: message.position || null
      }));
    }
  });
}



// ==========================
// Voice signalling handlers
// ==========================
export async function handleJoinedVoice(roomId, userId) {
  console.log(`[WebRTC] User ${userId} joining voice room ${roomId}`);
  console.log(`[WebRTC] ICE servers being sent to client:`, JSON.stringify(ICE_SERVERS));

  const room = ensureVoiceRoom(roomId);
  room.add(userId);
  voicePresence.set(userId, { roomId, joinedAt: Date.now() });

  // Reply to joiner with current peers and ICE config
  const existing = Array.from(room).filter(id => id !== userId);
  console.log(`[WebRTC] Room ${roomId} existing peers:`, existing);
  console.log(`[WebRTC] Sending peer list to ${userId}:`, existing.map(pid => ({
    userId: pid,
    initiatorHint: buildPeerInitHint(userId, pid)
  })));

  sendToUser(userId, {
    type: 'voice_peer_list',
    roomId,
    peers: existing.map(pid => ({ userId: pid, initiatorHint: buildPeerInitHint(userId, pid) })),
    iceServers: ICE_SERVERS,
  });

  // Notify others
  console.log(`[WebRTC] Notifying existing peers in room ${roomId} about new user ${userId}`);
  broadcastVoice(roomId, {
    type: 'voice_peer_joined',
    roomId,
    userId,
  }, userId);

  console.log(`[WebRTC] Room ${roomId} now has ${room.size} members:`, Array.from(room));
}

export async function handleLeaveVoice(roomId, userId) {
  console.log(`[WebRTC] User ${userId} leaving voice room ${roomId}`);

  const room = voiceRooms.get(roomId);
  if (!room) {
    console.log(`[WebRTC] Room ${roomId} not found for user ${userId}`);
    return;
  }

  const hadUser = room.has(userId);
  room.delete(userId);
  voicePresence.delete(userId);

  console.log(`[WebRTC] User ${userId} ${hadUser ? 'removed from' : 'was not in'} room ${roomId}`);
  console.log(`[WebRTC] Room ${roomId} remaining members:`, Array.from(room));

  broadcastVoice(roomId, { type: 'voice_peer_left', roomId, userId });

  if (room.size === 0) {
    console.log(`[WebRTC] Room ${roomId} is empty, deleting`);
    voiceRooms.delete(roomId);
  }
}

export async function handleVoiceSignal({ roomId, fromUserId, toUserId, data }) {
  console.log(`[WebRTC] Signal from ${fromUserId} to ${toUserId} in room ${roomId}`);
  console.log(`[WebRTC] Signal type:`, data?.type || 'unknown');

  const room = voiceRooms.get(roomId);
  if (!room) {
    console.log(`[WebRTC] ERROR: Room ${roomId} not found`);
    return;
  }

  if (!room.has(fromUserId)) {
    console.log(`[WebRTC] ERROR: Sender ${fromUserId} not in room ${roomId}`);
    return;
  }

  if (!room.has(toUserId)) {
    console.log(`[WebRTC] ERROR: Recipient ${toUserId} not in room ${roomId}`);
    return;
  }

  console.log(`[WebRTC] Forwarding signal from ${fromUserId} to ${toUserId}`);
  sendToUser(toUserId, {
    type: 'voice_signal',
    roomId,
    fromUserId,
    data,
  });
}

function broadcast(lobbyId, message, excludeWs = null) {
  console.log(`[Broadcast] Attempting to broadcast ${message.type} to lobby ${lobbyId}`);
  console.log(`[Broadcast] Connections for lobby ${lobbyId}:`, connections.has(lobbyId) ? connections.get(lobbyId).size : 0);

  if (!connections.has(lobbyId)) {
    console.log(`[Broadcast] No connections found for lobby ${lobbyId}`);
    return;
  }

  const data = JSON.stringify(message);
  let sentCount = 0;
  connections.get(lobbyId).forEach((client) => {
    if (client !== excludeWs && client.readyState === 1) { // OPEN state
      client.send(data);
      sentCount++;
    }
  });
  console.log(`[Broadcast] Sent ${message.type} to ${sentCount} client(s) in lobby ${lobbyId}`);
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

async function handleWebRTCOffer(ws, message, lobbyId) {
  const { targetUserId, offer } = message;

  // Forward offer to target user
  const targetWs = userSockets.get(targetUserId);
  if (targetWs && targetWs.readyState === 1) {
    targetWs.send(JSON.stringify({
      type: 'webrtc_offer',
      fromUserId: message.fromUserId,
      offer: offer
    }));
  }
}

async function handleWebRTCAnswer(ws, message, lobbyId) {
  const { targetUserId, answer } = message;

  const targetWs = userSockets.get(targetUserId);
  if (targetWs && targetWs.readyState === 1) {
    targetWs.send(JSON.stringify({
      type: 'webrtc_answer',
      fromUserId: message.fromUserId,
      answer: answer
    }));
  }
}

async function handleICECandidate(ws, message, lobbyId) {
  const { targetUserId, candidate } = message;

  const targetWs = userSockets.get(targetUserId);
  if (targetWs && targetWs.readyState === 1) {
    targetWs.send(JSON.stringify({
      type: 'webrtc_ice_candidate',
      fromUserId: message.fromUserId,
      candidate: candidate
    }));
  }
}

export { connections, userSockets, broadcast, broadcastLobbyListUpdate };
