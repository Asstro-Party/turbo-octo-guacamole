# Game Data Cleanup System

## Overview

This system automatically cleans up old and stale game data to prevent database bloat and maintain performance.

## Why Cleanup is Important

Keeping old game sessions has several problems:

1. **Database Bloat** - Accumulates storage, increasing costs
2. **Performance Degradation** - Queries become slower with large tables
3. **Stale Data** - Old sessions can confuse analytics
4. **Memory Issues** - Redis lobbies consume memory unnecessarily

## Automatic Cleanup (Recommended)

The system automatically runs cleanup tasks every **6 hours** when the server starts.

### What Gets Cleaned Up

| Data Type | Criteria | Default Threshold |
|-----------|----------|-------------------|
| Old Finished Games | `status='finished'` and ended | 7 days |
| Abandoned Lobbies | `status='waiting'` and never started | 24 hours |
| Stuck Games | `status='in_progress'` but never ended | 2 hours |
| Stale Redis Lobbies | No active connections | 24 hours |

### Configuration

Edit `backend/src/jobs/cleanup.js` to adjust thresholds:

```javascript
// In runAllCleanupTasks()
cleanupOldGameSessions(7)      // Days before removing finished games
cleanupAbandonedSessions(24)   // Hours before removing waiting lobbies
cleanupStuckSessions(2)        // Hours before marking stuck games as finished
```

## Manual Cleanup

You can trigger cleanup manually via API endpoints (requires authentication).

### Get Cleanup Statistics

```bash
GET /api/admin/cleanup/stats
```

Returns how many sessions are eligible for cleanup.

**Example Response:**
```json
{
  "success": true,
  "stats": {
    "totalSessions": 1523,
    "cleanupEligible": {
      "oldFinished": 487,
      "abandonedWaiting": 23,
      "stuckInProgress": 2
    }
  }
}
```

### Run All Cleanup Tasks

```bash
POST /api/admin/cleanup/all
Authorization: Bearer <your-token>
```

**Example Response:**
```json
{
  "success": true,
  "message": "Cleanup completed successfully",
  "results": {
    "oldSessions": 487,
    "abandonedSessions": 23,
    "stuckSessions": 2,
    "redisLobbies": 5
  }
}
```

### Individual Cleanup Tasks

#### Clean Old Finished Games
```bash
POST /api/admin/cleanup/old-sessions
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "daysOld": 7
}
```

#### Clean Abandoned Waiting Lobbies
```bash
POST /api/admin/cleanup/abandoned-sessions
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "hoursOld": 24
}
```

#### Clean Stuck In-Progress Games
```bash
POST /api/admin/cleanup/stuck-sessions
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "hoursOld": 2
}
```

#### Clean Stale Redis Lobbies
```bash
POST /api/admin/cleanup/redis-lobbies
Authorization: Bearer <your-token>
```

## Database Index

An optimized index was added for cleanup queries:

```sql
CREATE INDEX idx_game_sessions_cleanup 
    ON game_sessions(status, ended_at, created_at, started_at);
```

This ensures cleanup queries run efficiently even with millions of records.

## Monitoring

Check server logs for cleanup activity:

```
🧹 Starting cleanup tasks...
🧹 Cleaned up 487 old game sessions (older than 7 days)
🧹 Cleaned up 23 abandoned waiting sessions (older than 24 hours)
🧹 Marked 2 stuck in-progress sessions as finished (older than 2 hours)
🧹 Cleaned up 5 stale Redis lobbies
✅ Cleanup completed: { oldSessions: 487, abandonedSessions: 23, stuckSessions: 2, redisLobbies: 5 }
⏰ Scheduled periodic cleanup every 6 hours
```

## Best Practices

1. **Let Automatic Cleanup Run** - Don't disable it unless you have a reason
2. **Adjust Thresholds Based on Usage** - If you have very active servers, reduce thresholds
3. **Monitor Disk Usage** - If database grows rapidly, reduce cleanup thresholds
4. **Keep Recent Games** - Don't clean finished games too aggressively; keep at least 7 days for analytics
5. **Archive Before Deleting** - If you need long-term analytics, export old data before cleanup

## Troubleshooting

### Cleanup Not Running
- Check server logs for errors during startup
- Verify database connection is working
- Check Redis connection

### Too Aggressive Cleanup
- Increase thresholds in `cleanup.js`
- Check if cleanup runs too frequently

### Database Still Growing
- Lower cleanup thresholds
- Add more frequent cleanup intervals
- Consider archiving to external storage

## Manual Database Cleanup (Emergency)

If you need to manually clean the database:

```sql
-- View session counts by status
SELECT status, COUNT(*) FROM game_sessions GROUP BY status;

-- Delete old finished games (older than 30 days)
DELETE FROM game_sessions 
WHERE status = 'finished' 
AND ended_at < NOW() - INTERVAL '30 days';

-- Clean abandoned lobbies (older than 7 days)
DELETE FROM game_sessions 
WHERE status = 'waiting' 
AND created_at < NOW() - INTERVAL '7 days';

-- Mark stuck games as finished
UPDATE game_sessions 
SET status = 'finished', ended_at = NOW() 
WHERE status = 'in_progress' 
AND started_at < NOW() - INTERVAL '1 day';
```
