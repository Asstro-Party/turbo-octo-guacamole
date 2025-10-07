import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import {
  createLobby,
  getLobby,
  updateLobby,
  deleteLobby,
  getActiveLobbies
} from '../config/redis.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get all active lobbies (server browser)
router.get('/list', authenticate, async (req, res) => {
  try {
    const lobbies = await getActiveLobbies();

    // Filter out full and in-progress lobbies
    const availableLobbies = lobbies
      .filter(l => l.status === 'waiting' && l.currentPlayers < l.maxPlayers)
      .map(l => ({
        lobbyId: l.lobbyId,
        hostUserId: l.hostUserId,
        currentPlayers: l.currentPlayers,
        maxPlayers: l.maxPlayers,
        status: l.status,
        createdAt: l.createdAt
      }));

    res.json(availableLobbies);

  } catch (error) {
    console.error('Lobby list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new lobby
router.post('/create', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { maxPlayers = 4 } = req.body;

    const lobbyId = uuidv4();
    const lobby = await createLobby(lobbyId, userId, maxPlayers);

    // Create game session in PostgreSQL
    await pool.query(
      'INSERT INTO game_sessions (lobby_id, host_user_id, max_players, current_players) VALUES ($1, $2, $3, $4)',
      [lobbyId, userId, maxPlayers, 1]
    );

    res.status(201).json(lobby);

  } catch (error) {
    console.error('Create lobby error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join lobby
router.post('/:lobbyId/join', authenticate, async (req, res) => {
  try {
    const { lobbyId } = req.params;
    const userId = req.user.id;

    const lobby = await getLobby(lobbyId);

    if (!lobby) {
      return res.status(404).json({ error: 'Lobby not found' });
    }

    if (lobby.status !== 'waiting') {
      return res.status(400).json({ error: 'Game already started' });
    }

    if (lobby.currentPlayers >= lobby.maxPlayers) {
      return res.status(400).json({ error: 'Lobby is full' });
    }

    if (lobby.players.includes(userId)) {
      return res.status(400).json({ error: 'Already in lobby' });
    }

    // Update lobby
    lobby.players.push(userId);
    lobby.currentPlayers++;
    await updateLobby(lobbyId, lobby);

    // Update database
    await pool.query(
      'UPDATE game_sessions SET current_players = $1 WHERE lobby_id = $2',
      [lobby.currentPlayers, lobbyId]
    );

    res.json(lobby);

  } catch (error) {
    console.error('Join lobby error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave lobby
router.post('/:lobbyId/leave', authenticate, async (req, res) => {
  try {
    const { lobbyId } = req.params;
    const userId = req.user.id;

    const lobby = await getLobby(lobbyId);

    if (!lobby) {
      return res.status(404).json({ error: 'Lobby not found' });
    }

    lobby.players = lobby.players.filter(id => id !== userId);
    lobby.currentPlayers--;

    // If lobby is empty, delete it
    if (lobby.currentPlayers === 0) {
      await deleteLobby(lobbyId);
      await pool.query('DELETE FROM game_sessions WHERE lobby_id = $1', [lobbyId]);
    } else {
      // If host left, assign new host
      if (lobby.hostUserId === userId && lobby.players.length > 0) {
        lobby.hostUserId = lobby.players[0];
      }
      await updateLobby(lobbyId, lobby);
      await pool.query(
        'UPDATE game_sessions SET current_players = $1, host_user_id = $2 WHERE lobby_id = $3',
        [lobby.currentPlayers, lobby.hostUserId, lobbyId]
      );
    }

    res.json({ message: 'Left lobby successfully' });

  } catch (error) {
    console.error('Leave lobby error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get lobby details
router.get('/:lobbyId', authenticate, async (req, res) => {
  try {
    const { lobbyId } = req.params;
    const lobby = await getLobby(lobbyId);

    if (!lobby) {
      return res.status(404).json({ error: 'Lobby not found' });
    }

    res.json(lobby);

  } catch (error) {
    console.error('Get lobby error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
