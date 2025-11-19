import express from 'express';
import { runAllCleanupTasks, cleanupOldGameSessions, cleanupAbandonedSessions, cleanupStuckSessions, cleanupStaleRedisLobbies } from '../jobs/cleanup.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * Manual cleanup endpoint - Run all cleanup tasks
 * Protected route - requires authentication
 */
router.post('/cleanup/all', authenticate, async (req, res) => {
  try {
    const results = await runAllCleanupTasks();
    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      results
    });
  } catch (error) {
    console.error('Manual cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      details: error.message
    });
  }
});

/**
 * Cleanup old finished game sessions
 */
router.post('/cleanup/old-sessions', authenticate, async (req, res) => {
  try {
    const { daysOld = 7 } = req.body;
    const count = await cleanupOldGameSessions(daysOld);
    res.json({
      success: true,
      message: `Cleaned up ${count} old game sessions`,
      count
    });
  } catch (error) {
    console.error('Old sessions cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      details: error.message
    });
  }
});

/**
 * Cleanup abandoned waiting sessions
 */
router.post('/cleanup/abandoned-sessions', authenticate, async (req, res) => {
  try {
    const { hoursOld = 24 } = req.body;
    const count = await cleanupAbandonedSessions(hoursOld);
    res.json({
      success: true,
      message: `Cleaned up ${count} abandoned sessions`,
      count
    });
  } catch (error) {
    console.error('Abandoned sessions cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      details: error.message
    });
  }
});

/**
 * Cleanup stuck in-progress sessions
 */
router.post('/cleanup/stuck-sessions', authenticate, async (req, res) => {
  try {
    const { hoursOld = 2 } = req.body;
    const count = await cleanupStuckSessions(hoursOld);
    res.json({
      success: true,
      message: `Cleaned up ${count} stuck sessions`,
      count
    });
  } catch (error) {
    console.error('Stuck sessions cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      details: error.message
    });
  }
});

/**
 * Cleanup stale Redis lobbies
 */
router.post('/cleanup/redis-lobbies', authenticate, async (req, res) => {
  try {
    const count = await cleanupStaleRedisLobbies();
    res.json({
      success: true,
      message: `Cleaned up ${count} stale Redis lobbies`,
      count
    });
  } catch (error) {
    console.error('Redis lobbies cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      details: error.message
    });
  }
});

/**
 * Get cleanup statistics
 */
router.get('/cleanup/stats', authenticate, async (req, res) => {
  try {
    const pool = (await import('../config/database.js')).default;
    
    const [oldSessions, abandonedSessions, stuckSessions, totalSessions] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM game_sessions WHERE status = 'finished' AND ended_at < NOW() - INTERVAL '7 days'"),
      pool.query("SELECT COUNT(*) as count FROM game_sessions WHERE status = 'waiting' AND created_at < NOW() - INTERVAL '24 hours'"),
      pool.query("SELECT COUNT(*) as count FROM game_sessions WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '2 hours' AND ended_at IS NULL"),
      pool.query("SELECT COUNT(*) as count FROM game_sessions")
    ]);

    res.json({
      success: true,
      stats: {
        totalSessions: parseInt(totalSessions.rows[0].count),
        cleanupEligible: {
          oldFinished: parseInt(oldSessions.rows[0].count),
          abandonedWaiting: parseInt(abandonedSessions.rows[0].count),
          stuckInProgress: parseInt(stuckSessions.rows[0].count)
        }
      }
    });
  } catch (error) {
    console.error('Failed to get cleanup stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
      details: error.message
    });
  }
});

export default router;
