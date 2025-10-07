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
import { setupWebSocketServer } from './websocket/gameServer.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/lobby', lobbyRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server
async function startServer() {
  try {
    // Connect to databases
    await connectDB();
    await connectRedis();

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 HTTP Server running on port ${PORT}`);
    });

    // Start WebSocket server for game networking
    const httpServer = createServer();
    const wss = new WebSocketServer({ server: httpServer });
    setupWebSocketServer(wss);

    httpServer.listen(WS_PORT, () => {
      console.log(`🎮 WebSocket Server running on port ${WS_PORT}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
