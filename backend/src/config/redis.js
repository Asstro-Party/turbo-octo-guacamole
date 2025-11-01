import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// Support Railway's REDIS_URL or individual connection params
const redisConfig = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : {
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
      }
    };

const redisClient = createClient(redisConfig);

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('✅ Connected to Redis'));

export async function connectRedis() {
  await redisClient.connect();
}

// Lobby management helpers
export async function createLobby(lobbyId, hostUserId, maxPlayers = 4) {
  const lobby = {
    lobbyId,
    hostUserId,
    maxPlayers,
    currentPlayers: 1,
    players: [hostUserId],
    playerModels: { [hostUserId]: null },
    status: 'waiting',
    createdAt: Date.now()
  };
  await redisClient.set(`lobby:${lobbyId}`, JSON.stringify(lobby));
  await redisClient.sAdd('lobbies:active', lobbyId);
  return lobby;
}

export async function getLobby(lobbyId) {
  const data = await redisClient.get(`lobby:${lobbyId}`);
  return data ? JSON.parse(data) : null;
}

export async function updateLobby(lobbyId, updates) {
  const lobby = await getLobby(lobbyId);
  if (!lobby) return null;
  const updated = { ...lobby, ...updates };
  await redisClient.set(`lobby:${lobbyId}`, JSON.stringify(updated));
  return updated;
}

export async function deleteLobby(lobbyId) {
  await redisClient.del(`lobby:${lobbyId}`);
  await redisClient.sRem('lobbies:active', lobbyId);
}

export async function getActiveLobbies() {
  const lobbyIds = await redisClient.sMembers('lobbies:active');
  const lobbies = await Promise.all(
    lobbyIds.map(id => getLobby(id))
  );
  return lobbies.filter(l => l !== null);
}

// Session management
export async function setSession(token, userId, expiresIn = 604800) {
  await redisClient.setEx(`session:${token}`, expiresIn, userId.toString());
}

export async function getSession(token) {
  return await redisClient.get(`session:${token}`);
}

export async function deleteSession(token) {
  await redisClient.del(`session:${token}`);
}

export default redisClient;
