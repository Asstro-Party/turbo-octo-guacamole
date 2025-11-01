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

// Middleware
// Support multiple CORS origins (comma-separated)
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
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

    // Create HTTP server with Express app
    const httpServer = createServer(app);

    // Attach WebSocket server to the same HTTP server
    const wss = new WebSocketServer({ server: httpServer });
    setupWebSocketServer(wss);

    // Start combined HTTP + WebSocket server on one port
    httpServer.listen(PORT, () => {
      console.log(`🚀 HTTP + WebSocket Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
