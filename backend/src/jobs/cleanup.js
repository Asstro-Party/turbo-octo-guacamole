import pool from '../config/database.js';
import { getActiveLobbies, deleteLobby } from '../config/redis.js';

/**
 * Cleanup old and stale game data
 * This should be run periodically (e.g., daily via cron or on server startup)
 */

/**
 * Clean up finished game sessions older than specified days
 * @param {number} daysOld - Remove sessions finished more than this many days ago
 */
export async function cleanupOldGameSessions(daysOld = 7) {
  try {
    const result = await pool.query(
      `DELETE FROM game_sessions 
       WHERE status = 'finished' 
       AND ended_at < NOW() - INTERVAL '${daysOld} days'`
    );
    console.log(`Cleaned up ${result.rowCount} old game sessions (older than ${daysOld} days)`);
    return result.rowCount;
  } catch (error) {
    console.error('Error cleaning up old game sessions:', error);
    throw error;
  }
}

/**
 * Clean up abandoned game sessions that never started
 * @param {number} hoursOld - Remove waiting sessions created more than this many hours ago
 */
export async function cleanupAbandonedSessions(hoursOld = 24) {
  try {
    const result = await pool.query(
      `DELETE FROM game_sessions 
       WHERE status = 'waiting' 
       AND created_at < NOW() - INTERVAL '${hoursOld} hours'`
    );
    console.log(`Cleaned up ${result.rowCount} abandoned waiting sessions (older than ${hoursOld} hours)`);
    return result.rowCount;
  } catch (error) {
    console.error('Error cleaning up abandoned sessions:', error);
    throw error;
  }
}

/**
 * Clean up stuck in-progress sessions that never finished
 * @param {number} hoursOld - Remove in-progress sessions started more than this many hours ago
 */
export async function cleanupStuckSessions(hoursOld = 2) {
  try {
    const result = await pool.query(
      `UPDATE game_sessions 
       SET status = 'finished', ended_at = NOW() 
       WHERE status = 'in_progress' 
       AND started_at < NOW() - INTERVAL '${hoursOld} hours'
       AND ended_at IS NULL`
    );
    console.log(`Marked ${result.rowCount} stuck in-progress sessions as finished (older than ${hoursOld} hours)`);
    return result.rowCount;
  } catch (error) {
    console.error('Error cleaning up stuck sessions:', error);
    throw error;
  }
}

/**
 * Clean up stale Redis lobbies that don't have active connections
 */
export async function cleanupStaleRedisLobbies() {
  try {
    const lobbies = await getActiveLobbies();
    let cleanedCount = 0;

    for (const lobby of lobbies) {
      // Check if lobby is older than 24 hours
      const ageHours = (Date.now() - lobby.createdAt) / (1000 * 60 * 60);
      
      if (ageHours > 24) {
        await deleteLobby(lobby.lobbyId);
        cleanedCount++;
        console.log(`Removed stale Redis lobby: ${lobby.lobbyId} (${ageHours.toFixed(1)}h old)`);
      }
    }

    console.log(`Cleaned up ${cleanedCount} stale Redis lobbies`);
    return cleanedCount;
  } catch (error) {
    console.error('Error cleaning up Redis lobbies:', error);
    throw error;
  }
}

/**
 * Run all cleanup tasks
 */
export async function runAllCleanupTasks() {
  console.log('Starting cleanup tasks...');
  
  const results = {
    oldSessions: await cleanupOldGameSessions(7),
    abandonedSessions: await cleanupAbandonedSessions(24),
    stuckSessions: await cleanupStuckSessions(2),
    redisLobbies: await cleanupStaleRedisLobbies()
  };

  console.log('Cleanup completed:', results);
  return results;
}

/**
 * Schedule periodic cleanup (runs every 6 hours)
 */
export function schedulePeriodicCleanup() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  
  // Run immediately on startup
  runAllCleanupTasks().catch(err => 
    console.error('Failed to run initial cleanup:', err)
  );

  // Then run every 6 hours
  setInterval(() => {
    runAllCleanupTasks().catch(err => 
      console.error('Failed to run periodic cleanup:', err)
    );
  }, SIX_HOURS);

  console.log('Scheduled periodic cleanup every 6 hours');
}
