import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

// Mock database functions for unit tests
export const clearDatabase = async () => {
  // This is only used in integration tests
  // For unit tests, this can be a no-op
  console.log('clearDatabase called (no-op in unit tests)');
};

export const createTestUser = async (username = 'testuser', email = 'test@example.com') => {
  // Return a mock user object
  return {
    id: Math.floor(Math.random() * 10000),
    username,
    email,
    created_at: new Date()
  };
};

export const generateTestToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
};

export const createTestLobby = async (hostUserId, maxPlayers = 4) => {
  const lobbyId = `TEST-${Date.now()}`;
  return {
    lobby_id: lobbyId,
    host_user_id: hostUserId,
    max_players: maxPlayers,
    status: 'waiting',
    created_at: new Date()
  };
};

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// For integration tests that need database
let pool;
export const initTestDatabase = async () => {
  const { Pool } = await import('pg');
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5433,
    database: process.env.DB_NAME + '_test' || 'astro_party_test',
    user: process.env.DB_USER || 'gameuser',
    password: process.env.DB_PASSWORD || 'gamepass'
  });
  return pool;
};

export const closeTestDatabase = async () => {
  if (pool) {
    await pool.end();
  }
};

export const getTestPool = () => pool;