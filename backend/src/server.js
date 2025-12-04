import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { connectDB } from './config/database.js';
import { connectRedis } from './config/redis.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import lobbyRoutes from './routes/lobby.js';
import adminRoutes from './routes/admin.js';
import { setupWebSocketServer } from './websocket/gameServer.js';
import { schedulePeriodicCleanup } from './jobs/cleanup.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;

// Middleware
// Support multiple CORS origins (comma-separated)
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173'];

// Debug: Log allowed origins on startup
console.log('🌐 Allowed CORS origins:', allowedOrigins);

// CORS configuration
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Log ALL incoming requests for debugging
  console.log(`📥 ${req.method} ${req.path} from origin: ${origin || 'none'}`);
  
  // Set CORS headers for allowed origins
  if (origin && allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Expose-Headers', 'Authorization');
    console.log(`✅ CORS headers set for origin: ${origin}`);
  } else if (origin) {
    console.log(`❌ Origin not allowed: ${origin}`);
  }
  
  // Handle preflight requests immediately
  if (req.method === 'OPTIONS') {
    console.log(`✅ Preflight handled for ${req.path}`);
    return res.status(200).end();
  }
  
  next();
});

// Parse JSON bodies - THIS WAS MISSING!
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/lobby', lobbyRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware
app.use((err, req, res, _next) => {
  if (err.message === 'Not allowed by CORS') {
    if (!res.headersSent) {
      return res.status(403).json({
        error: 'Not allowed by CORS'
      });
    }
    return;
  }
  
  console.error('Error:', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error'
    });
  }
});

// Start server
async function startServer() {
  try {
    // Connect to databases
    await connectDB();
    await connectRedis();

    // Schedule periodic cleanup of old game data
    schedulePeriodicCleanup();

    // Create HTTP server with Express app
    const httpServer = createServer(app);

    // Attach WebSocket server to the same HTTP server
    const wss = new WebSocketServer({ server: httpServer });
    setupWebSocketServer(wss);

    // Start HTTP server (WebSocket will use the same port)
    httpServer.listen(PORT, () => {
      console.log(`🚀 HTTP Server running on port ${PORT}`);
      console.log(`🎮 WebSocket Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
