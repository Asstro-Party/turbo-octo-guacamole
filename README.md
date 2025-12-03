# Astro Party - Multiplayer Web Game

A real-time multiplayer space shooter game where 4 players battle in an arena. Built with **Godot 4**, **Node.js**, **React**, **PostgreSQL**, and **Redis**.

## Features

- **Multiplayer Gameplay** - 4 players battle in real-time
- **Server Browser** - Browse and join available lobbies
- **Voice Chat** - In-game voice communication via WebRTC
- **User Authentication** - Signup/Login system
- **Player Profiles** - Track kills, deaths, K/D ratio, wins
- **Multi-Session Support** - Multiple concurrent games
- **Web-Based** - Play directly in your browser

## Quick Start

### Option 1: Docker (Recommended - Production-like Setup)

Run the entire application with one command:

```bash
# 1. Create environment file
cp .env.example .env
# Edit .env and set a strong JWT_SECRET

# 2. Build and start all services
docker-compose up --build

# 3. Access the application
# Frontend: http://localhost:5173
# Backend API: http://localhost:3000
# WebSocket: ws://localhost:3001
```

**What Docker runs:**
- ✅ PostgreSQL database (with auto-initialization)
- ✅ Redis cache
- ✅ Backend server (waits for database to be ready)
- ✅ Frontend (production build served by Nginx)

**Manage containers:**
```bash
# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove all data
docker-compose down -v
```

### Option 2: Development Mode (Local Development)

For active development with hot reload:

```bash
# 1. Start only databases
docker-compose up postgres redis -d

# 2. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 3. Configure backend environment
cd backend
cp .env.example .env
# Edit .env if needed (default values work for local development)

# 4. Start backend (in one terminal)
cd backend
npm run dev

# 5. Start frontend (in another terminal)
cd frontend
npm run dev
```

Open http://localhost:5173 to play!

### First Time Setup (Development Mode Only)

If running in development mode for the first time:

1. **Install dependencies:**
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **Configure environment:**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env if needed (default values work for local development)
   ```

3. **Start databases:**
   ```bash
   docker-compose up postgres redis -d
   ```

4. **Running tests:**
   ```bash
   cd backend
   # Unit tests
   npm run test:unit
   # Load tests
   npm run test:load
   # Load tests (with report)
   npm run test:load:report
   ```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Game Engine | Godot 4.2 (WebAssembly/HTML5) |
| Backend | Node.js + Express |
| Real-time Networking | WebSockets (ws library) |
| Frontend | React + Vite |
| Database | PostgreSQL |
| Session Store | Redis |
| Voice Chat | WebRTC (P2P) |
| Authentication | JWT + bcrypt |

## Architecture

```
Frontend (React)
  ├── Auth Pages (Login/Signup)
  ├── Lobby Browser (Server list)
  ├── Profile Page (Stats)
  └── Game Page (Godot iframe + Voice chat)

Backend (Node.js)
  ├── REST API (Auth, Lobby, Profile)
  ├── WebSocket Server (Game networking)
  ├── PostgreSQL (Users, Stats, Games)
  └── Redis (Active lobbies, Sessions)

Game (Godot 4)
  ├── Player movement & shooting
  ├── WebSocket client
  └── Multiplayer synchronization
```

## Game Controls

- **WASD** - Move ship
- **Mouse** - Aim
- **Left Click** - Shoot
- **Microphone Button** - Toggle voice chat

## Project Structure

```
turbo-octo-guacamole/
├── backend/              # Node.js server
│   ├── src/
│   │   ├── routes/       # REST API routes
│   │   ├── websocket/    # WebSocket game server
│   │   ├── config/       # Database connections
│   │   └── middleware/   # Authentication
│   └── db/               # Database schema
├── frontend/             # React web app
│   ├── src/
│   │   ├── pages/        # Auth, Lobby, Game, Profile
│   │   ├── components/   # React components
│   │   └── services/     # API client
│   └── public/
│       └── godot-game/   # Exported Godot build
├── godot-game/           # Godot 4 project
│   ├── scenes/           # Game scenes
│   ├── scripts/          # GDScript files
│   └── export/           # HTML5 export output
└── docker-compose.yml    # PostgreSQL + Redis
```

### Godot
1. Open `godot-game/project.godot` in Godot 4.2+
2. Make changes
3. Export to Web (Project → Export)
4. Copy to `frontend/public/godot-game/`

## Deployment

Ready to deploy your game to production? We've got you covered!

### 📦 Deployment Guides

- **[Quick Start Guide](DEPLOYMENT-QUICK-START.md)** - 5-minute deployment (Vercel + Railway)
- **[Full Deployment Guide](DEPLOYMENT.md)** - Complete step-by-step instructions

**Cost:** 100% FREE using Vercel (frontend) + Railway (backend + databases)

**No Docker required** - Both platforms handle deployment automatically!

---

## Configuration Notes

### Docker Setup
- **Frontend:** http://localhost:5173 (Nginx serves production build)
- **Backend API:** http://localhost:3000
- **WebSocket:** ws://localhost:3001
- **PostgreSQL:** localhost:5433 (host) → 5432 (container)
- **Redis:** localhost:6379

### Development Mode
- **Frontend Dev Server:** http://localhost:5173 (Vite with hot reload)
- **Backend Dev Server:** http://localhost:3000 (Nodemon with hot reload)
- **PostgreSQL Port:** 5433 (local)
- **WebSocket Port:** 3001
