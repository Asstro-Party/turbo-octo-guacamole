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

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Game Engine | Godot 4.5 (WebAssembly/HTML5) |
| Backend | Node.js + Express |
| Real-time Networking | WebSockets (ws library) |
| Frontend | React + Vite |
| Database | PostgreSQL |
| Session Store | Redis |
| Voice Chat | WebRTC (P2P) |
| Authentication | JWT + bcrypt |

## Quick Start with Docker Compose

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

**What Docker Compose runs:**
- PostgreSQL database (with auto-initialization)
- Redis cache
- Backend server (waits for database to be ready)
- Frontend (production build served by Nginx)

**Manage containers:**
```bash
# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove all data
docker-compose down -v
```

## Local Development

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

# 4. Configure backend environment
cd frontend
cp .env.example .env
# Edit .env if needed (default values work for local development)

# 5. Start backend (in one terminal)
cd backend
npm run dev

# 6. Start frontend (in another terminal)
cd frontend
npm run dev
```

Open http://localhost:5173 to play!

## Running Tests

```bash
cd backend

# Unit tests
npm run test:unit

# Load tests
npm run test:load

# Load tests (with report)
npm run test:load:report
```

### Godot
1. Open `godot-game/project.godot` in Godot 4.5
2. Make changes
3. Export to Web (Project → Export)
4. Copy to `frontend/public/godot-game/`


## CICD

**Cost:** 100% FREE using Vercel (frontend) + Railway (backend + databases)

**Continuous Deployment** - Both Vercel and Railway will detect changes in the `main` branch of the repository and handle deployment automatically!

### Deployment Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Cloudflare CDN                     │
│            (DNS, DDoS protection, Cache)            │
└───────────────────────┬─────────────────────────────┘
                        │
           ┌────────────┴───────────┐
           │                        │
    ┌──────▼──────┐         ┌──────▼──────┐
    │   Vercel    │         │   Railway   │
    │  (Frontend) │         │  (Backend)  │
    │             │         │             │
    │  - React    │         │  - Node.js  │
    │  - Godot    │         │  - Express  │
    │    HTML5    │         │  - WS       │
    └─────────────┘         └──────┬──────┘
                                   │
                        ┌──────────┴──────────┐
                        │                     │
                 ┌──────▼──────┐      ┌──────▼──────┐
                 │ Managed     │      │  Managed    │
                 │ PostgreSQL  │      │  Redis      │
                 │ (AWS RDS)   │      │ (Redis      │
                 │             │      │  Cloud)     │
                 └─────────────┘      └─────────────┘
```
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
