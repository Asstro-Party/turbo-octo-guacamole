import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get user profile and stats
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT
        u.id, u.username, u.email, u.created_at,
        ps.total_kills, ps.total_deaths, ps.total_games, ps.wins
       FROM users u
       LEFT JOIN player_stats ps ON u.id = ps.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = result.rows[0];

    // Calculate K/D ratio
    const kdRatio = profile.total_deaths > 0
      ? (profile.total_kills / profile.total_deaths).toFixed(2)
      : profile.total_kills;

    // Calculate win rate
    const winRate = profile.total_games > 0
      ? ((profile.wins / profile.total_games) * 100).toFixed(1)
      : 0;

    res.json({
      id: profile.id,
      username: profile.username,
      email: profile.email,
      createdAt: profile.created_at,
      stats: {
        totalKills: profile.total_kills || 0,
        totalDeaths: profile.total_deaths || 0,
        totalGames: profile.total_games || 0,
        wins: profile.wins || 0,
        kdRatio: parseFloat(kdRatio),
        winRate: parseFloat(winRate)
      }
    });

  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent games
router.get('/games', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    const result = await pool.query(
      `SELECT
        gs.id, gs.lobby_id, gs.status, gs.started_at, gs.ended_at,
        gp.kills, gp.deaths, gp.placement
       FROM game_participants gp
       JOIN game_sessions gs ON gp.session_id = gs.id
       WHERE gp.user_id = $1
       ORDER BY gs.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Games history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
