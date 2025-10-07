# Astro Party - Setup Guide

A multiplayer web-based space shooter game inspired by Astro Party, built with Godot 4, Node.js, React, PostgreSQL, and Redis.

## Architecture Overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   React     │◄────►│   Node.js    │◄────►│  PostgreSQL │
│  Frontend   │      │   Backend    │      │  Database   │
│             │      │              │      └─────────────┘
│  ┌────────┐ │      │  ┌────────┐  │
│  │ Godot  │ │      │  │  WS    │  │      ┌─────────────┐
│  │ Game   │◄┼──────┼─►│ Server │◄─┼─────►│    Redis    │
│  └────────┘ │      │  └────────┘  │      │   Lobbies   │
└─────────────┘      └──────────────┘      └─────────────┘
       │
       └────────► WebRTC Voice Chat
```

## Prerequisites

1. **Node.js** (v18 or higher)
2. **Docker** (for PostgreSQL and Redis)
3. **Godot 4.2+** (for game development)
4. **Git**

## Installation Steps

### 1. Clone and Setup Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Start Database Services

```bash
# Start PostgreSQL and Redis with Docker
docker-compose up -d

# Verify containers are running
docker ps
```

### 3. Configure Environment

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your settings (default values should work for local development)

# Frontend (create .env file)
cd ../frontend
echo "VITE_API_URL=http://localhost:3000/api" > .env
echo "VITE_WS_URL=ws://localhost:3001" >> .env
```

### 4. Start Backend Server

```bash
cd backend
npm run dev

# Server will start on:
# - HTTP API: http://localhost:3000
# - WebSocket: ws://localhost:3001
```

### 5. Start Frontend Development Server

```bash
cd frontend
npm run dev

# Frontend will start on: http://localhost:5173
```

### 6. Build Godot Game

#### In Godot Editor:

1. Open Godot 4.2+
2. Import project: Select `godot-game/project.godot`
3. Configure HTML5 export:
   - Go to **Project → Export**
   - Add **Web** export preset
   - Download export templates if needed (Editor → Manage Export Templates)

4. Set up input actions (Project → Project Settings → Input Map):
   - `move_up`: W key
   - `move_down`: S key
   - `move_left`: A key
   - `move_right`: D key

5. Create the game scenes:

#### Main.tscn structure:
```
Main (Node2D)
├── NetworkManager (Node) [script: NetworkManager.gd]
├── GameManager (Node) [script: GameManager.gd]
│   └── Players (Node2D)
├── Arena (Node2D)
│   └── Background (ColorRect or Sprite2D)
└── UI (CanvasLayer)
    ├── HealthBar
    ├── Kills
    └── Deaths
```

#### Player.tscn structure:
```
Player (CharacterBody2D)
├── Sprite2D (triangle or ship sprite)
├── CollisionShape2D
└── Gun (Node2D - positioned at front of ship)
```

#### Bullet.tscn structure:
```
Bullet (Area2D) [script: Bullet.gd]
├── Sprite2D (small circle or laser)
└── CollisionShape2D
```

6. Export the game:
   - Project → Export
   - Select **Web** preset
   - Export to: `godot-game/export/index.html`
   - Click **Export Project**

7. Copy exported files to frontend public directory:
```bash
# From project root
mkdir -p frontend/public/godot-game
cp -r godot-game/export/* frontend/public/godot-game/
```

## Running the Full Application

### Start all services:

**Terminal 1 - Databases:**
```bash
docker-compose up
```

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

## Game Flow

1. **Sign Up / Login**: Create account or login
2. **Lobby Browser**: See available game lobbies
3. **Create/Join Lobby**: Start new game or join existing one (max 4 players)
4. **In-Game**:
   - Control ship with WASD
   - Aim with mouse
   - Shoot with left-click
   - Enable voice chat with microphone button
5. **Profile**: View your stats (kills, deaths, K/D ratio, wins)

## Database Schema

### Users Table
- `id`: Primary key
- `username`: Unique username
- `email`: Unique email
- `password_hash`: Bcrypt hashed password
- `created_at`, `updated_at`: Timestamps

### Player Stats Table
- `user_id`: Foreign key to users
- `total_kills`, `total_deaths`: Lifetime stats
- `total_games`, `wins`: Game statistics

### Game Sessions Table
- `lobby_id`: Unique lobby identifier
- `host_user_id`: Lobby creator
- `status`: waiting | in_progress | finished
- `max_players`, `current_players`: Lobby capacity

### Game Participants Table
- `session_id`: Foreign key to game_sessions
- `user_id`: Foreign key to users
- `kills`, `deaths`, `placement`: Per-game stats

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout

### Profile
- `GET /api/profile` - Get user profile and stats
- `GET /api/profile/games` - Get recent games

### Lobby
- `GET /api/lobby/list` - Get available lobbies (server browser)
- `POST /api/lobby/create` - Create new lobby
- `POST /api/lobby/:lobbyId/join` - Join lobby
- `POST /api/lobby/:lobbyId/leave` - Leave lobby
- `GET /api/lobby/:lobbyId` - Get lobby details

## WebSocket Protocol

### Client → Server Messages

**Join Game:**
```json
{
  "type": "join_game",
  "lobbyId": "uuid",
  "userId": 123,
  "username": "Player1"
}
```

**Player Action:**
```json
{
  "type": "player_action",
  "userId": 123,
  "action": "move|shoot",
  "data": {
    "position": {"x": 100, "y": 200},
    "rotation": 1.57,
    "velocity": {"x": 5, "y": 0}
  }
}
```

**Kill Event:**
```json
{
  "type": "kill",
  "killerId": 123,
  "victimId": 456,
  "sessionId": 1
}
```

**Start/End Game:**
```json
{
  "type": "start_game",
  "lobbyId": "uuid"
}

{
  "type": "end_game",
  "lobbyId": "uuid",
  "results": [
    {"userId": 123, "kills": 5, "deaths": 2, "placement": 1}
  ]
}
```

### Server → Client Messages

**Player Joined:**
```json
{
  "type": "player_joined",
  "userId": 123,
  "username": "Player1"
}
```

**Game State Updates:**
```json
{
  "type": "game_state",
  "state": {...},
  "timestamp": 1234567890
}
```

**Kill Notification:**
```json
{
  "type": "kill",
  "killerId": 123,
  "victimId": 456,
  "timestamp": 1234567890
}
```

## Voice Chat Integration

The game uses WebRTC for peer-to-peer voice chat. Each player establishes direct connections with other players in the lobby.

### Implementation Steps:

1. **Get Microphone Access:**
```javascript
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
```

2. **Create RTCPeerConnection** for each remote player

3. **Exchange SDP offers/answers** via WebSocket signaling server

4. **Exchange ICE candidates** for NAT traversal

5. **Add remote audio streams** to audio elements

### Optional: TURN Server
For production, you'll need a TURN server for users behind symmetric NATs:
- Use services like Twilio, Agora, or self-hosted coturn

## Embedding Godot in Web Page

The Godot game is embedded in the React app using an `<iframe>`:

```jsx
<iframe
  id="godot-game"
  src="/godot-game/index.html"
  title="Astro Party Game"
  style={{ width: '100%', height: '100%', border: 'none' }}
/>
```

### Communication between React and Godot:

**React → Godot:**
```javascript
const iframe = document.getElementById('godot-game');
iframe.contentWindow.postMessage(message, '*');
```

**Godot → React:**
```gdscript
# In Godot (web build)
if OS.has_feature("web"):
    JavaScriptBridge.eval("window.parent.postMessage({type: 'game_event', data: {}}, '*')")
```

## Multi-Session Support

The server supports multiple concurrent game sessions:

- **Redis** stores active lobby states in memory
- **PostgreSQL** persists game history and stats
- Each lobby has isolated WebSocket communication
- Connections are managed per lobby in `gameServer.js`

## Production Deployment

### Backend:
- Deploy to services like Railway, Render, or DigitalOcean
- Use managed PostgreSQL (AWS RDS, DigitalOcean, etc.)
- Use managed Redis (Redis Cloud, AWS ElastiCache)
- Set secure `JWT_SECRET` in environment variables
- Enable HTTPS and WSS (secure WebSocket)

### Frontend:
- Build: `npm run build`
- Deploy static files to Vercel, Netlify, or Cloudflare Pages
- Update API and WebSocket URLs in `.env`

### Godot:
- Export to Web and host on CDN or with frontend
- Ensure proper CORS headers for WebSocket connections

## Development Tips

1. **Hot Reload**: Both frontend (Vite) and backend (nodemon) support hot reload

2. **Database Debugging**:
```bash
# Connect to PostgreSQL
docker exec -it game_postgres psql -U gameuser -d astro_party

# Connect to Redis
docker exec -it game_redis redis-cli
```

3. **Godot Web Testing**:
   - Test locally: Use Godot's "Run Project" with web export
   - Browser console: Check for WebSocket errors
   - Use Firefox or Chrome for best WebAssembly support

4. **Network Testing**:
   - Open multiple browser windows for local multiplayer testing
   - Use different browser profiles or private/incognito mode

## Troubleshooting

### Godot game not loading:
- Check browser console for errors
- Verify export templates are installed
- Ensure files are copied to `frontend/public/godot-game/`

### WebSocket connection failed:
- Check backend WebSocket server is running on port 3001
- Verify firewall allows WebSocket connections
- Check CORS settings in backend

### Database connection errors:
- Ensure Docker containers are running: `docker ps`
- Check `.env` file has correct database credentials
- Verify ports 5432 (Postgres) and 6379 (Redis) aren't in use

### Voice chat not working:
- Check browser permissions for microphone access
- Verify HTTPS (WebRTC requires secure context in production)
- Check WebRTC peer connection states in console

## Next Steps

1. **Enhance Godot Game**:
   - Add power-ups
   - Multiple game modes
   - Better graphics and animations
   - Sound effects and music
   - Particle effects

2. **Improve Networking**:
   - Implement client-side prediction
   - Server reconciliation
   - Lag compensation
   - Anti-cheat measures

3. **Add Features**:
   - Friend system
   - Leaderboards
   - Achievements
   - Replays
   - Spectator mode
   - Custom ship skins

4. **Performance**:
   - Database query optimization
   - Redis caching strategies
   - CDN for static assets
   - Load balancing for multiple game servers

## Resources

- [Godot Documentation](https://docs.godotengine.org/)
- [Godot Multiplayer](https://docs.godotengine.org/en/stable/tutorials/networking/high_level_multiplayer.html)
- [WebRTC Guide](https://webrtc.org/getting-started/overview)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Redis Docs](https://redis.io/docs/)

## License

MIT License - Feel free to use this for your projects!
