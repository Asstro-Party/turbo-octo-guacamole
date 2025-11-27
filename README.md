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

### Running the Project

```bash
# 1. Start databases (if not already running)
docker-compose up -d

# 2. Start backend
cd backend
npm run dev

# 3. Start frontend (new terminal)
cd frontend
npm run dev
```

Open http://localhost:5173 to play!

### First Time Setup

If you haven't set up the project yet:

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
   docker-compose up -d
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

- **PostgreSQL Port:** 5433 (local), auto-configured on Railway
- **WebSocket Port:** 3001
- **Frontend Dev Server:** 5173
- **Backend API Port:** 3000
