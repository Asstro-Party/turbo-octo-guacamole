# System Architecture - Astro Party

## Complete System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              React Frontend (Port 5173)                    │ │
│  │                                                            │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │ │
│  │  │  Login/  │  │  Lobby   │  │ Profile  │  │   Game   │  │ │
│  │  │  Signup  │  │ Browser  │  │   Page   │  │   Page   │  │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────┬────┘  │ │
│  │                                                    │       │ │
│  │                                         ┌──────────▼─────┐ │ │
│  │                                         │  Godot Game    │ │ │
│  │                                         │  (iframe)      │ │ │
│  │                                         └────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│           │                    │                   │             │
│      HTTP REST             WebSocket          WebRTC P2P        │
│           │                    │                   │             │
└───────────┼────────────────────┼───────────────────┼─────────────┘
            │                    │                   │
            │                    │                   └──────────┐
            ▼                    ▼                              │
┌──────────────────────────────────────────────┐               │
│         Backend Server                        │               │
│                                               │               │
│  ┌─────────────────────────────────────────┐ │               │
│  │   HTTP Server (Port 3000)               │ │               │
│  │                                         │ │               │
│  │  ┌──────────┐  ┌──────────┐  ┌───────┐ │ │               │
│  │  │   Auth   │  │  Lobby   │  │Profile│ │ │               │
│  │  │  Routes  │  │  Routes  │  │Routes │ │ │               │
│  │  └──────────┘  └──────────┘  └───────┘ │ │               │
│  └─────────────────────────────────────────┘ │               │
│                                               │               │
│  ┌─────────────────────────────────────────┐ │               │
│  │   WebSocket Server (Port 3001)          │ │               │
│  │                                         │ │               │
│  │  ┌──────────────────────────────────┐  │ │               │
│  │  │  Game Networking                 │  │ │               │
│  │  │  - Player actions                │  │ │               │
│  │  │  - Game state sync               │  │ │               │
│  │  │  - Kill tracking                 │  │ │               │
│  │  │  - WebRTC signaling              │◄─┼─┼───────────────┘
│  │  └──────────────────────────────────┘  │ │
│  └─────────────────────────────────────────┘ │
│              │                    │           │
└──────────────┼────────────────────┼───────────┘
               │                    │
               ▼                    ▼
      ┌────────────────┐   ┌────────────────┐
      │   PostgreSQL   │   │     Redis      │
      │   (Port 5432)  │   │  (Port 6379)   │
      │                │   │                │
      │  - Users       │   │  - Sessions    │
      │  - Stats       │   │  - Lobbies     │
      │  - Games       │   │  - Cache       │
      └────────────────┘   └────────────────┘
         (Docker)              (Docker)
```

## Data Flow Diagrams

### 1. User Authentication Flow

```
┌──────┐                    ┌──────────┐                ┌──────────┐
│Client│                    │ Backend  │                │PostgreSQL│
└───┬──┘                    └────┬─────┘                └────┬─────┘
    │                            │                           │
    │ POST /api/auth/signup      │                           │
    ├───────────────────────────>│                           │
    │                            │ INSERT INTO users         │
    │                            ├──────────────────────────>│
    │                            │                           │
    │                            │<──────────────────────────┤
    │                            │ User created              │
    │                            │                           │
    │                            │ Generate JWT              │
    │                            │ Store in Redis            │
    │<───────────────────────────┤                           │
    │ { token, user }            │                           │
    │                            │                           │
    │ Subsequent requests        │                           │
    │ with Authorization header  │                           │
    ├───────────────────────────>│                           │
    │                            │ Verify JWT                │
    │                            │ Check Redis session       │
    │<───────────────────────────┤                           │
    │ Protected data             │                           │
```

### 2. Lobby Creation & Joining Flow

```
Player 1                Backend              PostgreSQL         Redis
   │                       │                     │               │
   │ Create Lobby          │                     │               │
   ├──────────────────────>│                     │               │
   │                       │ INSERT game_session │               │
   │                       ├────────────────────>│               │
   │                       │                     │               │
   │                       │ CREATE lobby:uuid   │               │
   │                       ├─────────────────────────────────────>│
   │                       │                     │               │
   │                       │ ADD to lobbies:active              │
   │                       ├─────────────────────────────────────>│
   │<──────────────────────┤                     │               │
   │ { lobbyId, ... }      │                     │               │
   │                       │                     │               │

Player 2                Backend                               Redis
   │                       │                                     │
   │ GET /api/lobby/list   │                                     │
   ├──────────────────────>│                                     │
   │                       │ GET lobbies:active                  │
   │                       ├────────────────────────────────────>│
   │                       │<────────────────────────────────────┤
   │<──────────────────────┤ [lobby1, lobby2, ...]               │
   │ Available lobbies     │                                     │
   │                       │                                     │
   │ JOIN lobby:uuid       │                                     │
   ├──────────────────────>│                                     │
   │                       │ UPDATE lobby:uuid                   │
   │                       │ (add player, increment count)       │
   │                       ├────────────────────────────────────>│
   │<──────────────────────┤                                     │
   │ Success               │                                     │
```

### 3. Game Networking Flow

```
Player 1              WebSocket Server           Player 2, 3, 4
   │                         │                          │
   │ join_game               │                          │
   ├────────────────────────>│                          │
   │                         │ player_joined            │
   │                         ├─────────────────────────>│
   │                         │                          │
   │ player_action (move)    │                          │
   ├────────────────────────>│                          │
   │                         │ player_action            │
   │                         ├─────────────────────────>│
   │                         │ (broadcast to others)    │
   │                         │                          │
   │ player_action (shoot)   │                          │
   ├────────────────────────>│                          │
   │                         │ player_action            │
   │                         ├─────────────────────────>│
   │                         │                          │
   │ kill (victimId: 2)      │                          │
   ├────────────────────────>│                          │
   │                         │ UPDATE player_stats      │
   │                         │ kill notification        │
   │                         ├─────────────────────────>│
   │<────────────────────────┤ kill notification        │
   │                         │                          │
```

### 4. Voice Chat (WebRTC) Flow

```
Player 1           WebSocket (Signaling)         Player 2
   │                         │                       │
   │ Enable voice            │                       │
   │ Get microphone          │                       │
   │                         │                       │
   │ webrtc_offer            │                       │
   ├────────────────────────>│                       │
   │                         │ webrtc_offer          │
   │                         ├──────────────────────>│
   │                         │                       │
   │                         │ webrtc_answer         │
   │                         │<──────────────────────┤
   │ webrtc_answer           │                       │
   │<────────────────────────┤                       │
   │                         │                       │
   │ ICE candidates exchanged via WebSocket         │
   │<────────────────────────────────────────────────>│
   │                         │                       │
   │ ════════════ Direct P2P Audio Stream ══════════>│
   │<════════════════════════════════════════════════│
   │                         │                       │
```

## Component Responsibilities

### Frontend (React)

**Pages:**
- `Login.jsx` - User authentication
- `Signup.jsx` - Account creation
- `Lobby.jsx` - Server browser, lobby management
- `Profile.jsx` - Player stats display
- `Game.jsx` - Game container, voice chat controls

**Services:**
- `api.js` - REST API client
- `voiceChat.js` - WebRTC voice implementation

**Purpose:** User interface, game embedding, voice chat UI

---

### Backend (Node.js)

**HTTP Server (Port 3000):**

Routes:
- `/api/auth/*` - JWT-based authentication
- `/api/lobby/*` - Lobby CRUD operations
- `/api/profile/*` - User stats retrieval

**WebSocket Server (Port 3001):**

Handlers:
- `join_game` - Player enters game
- `player_action` - Movement, shooting
- `kill` - Combat event
- `start_game` / `end_game` - Match lifecycle
- `webrtc_*` - Voice chat signaling

**Purpose:** Business logic, game state authority, API gateway

---

### Database Layer

**PostgreSQL:**

Tables:
- `users` - Account information
- `player_stats` - Aggregated player statistics
- `game_sessions` - Match records
- `game_participants` - Per-match player data

**Purpose:** Persistent data storage, historical records

**Redis:**

Keys:
- `lobby:{uuid}` - Active lobby state
- `lobbies:active` - Set of active lobby IDs
- `session:{token}` - JWT session validation

**Purpose:** Fast in-memory cache, real-time state

---

### Godot Game Engine

**Scripts:**
- `NetworkManager.gd` - WebSocket client
- `GameManager.gd` - Game coordinator
- `Player.gd` - Ship controller
- `Bullet.gd` - Projectile physics

**Scenes:**
- `Main.tscn` - Game world
- `Player.tscn` - Player ship
- `Bullet.tscn` - Projectile

**Purpose:** Game logic, rendering, physics, input

---

## Technology Choices Explained

### Why WebSockets over WebRTC for Game?

| Aspect | WebSocket | WebRTC |
|--------|-----------|--------|
| Complexity | Simple | Complex |
| Server Authority | Yes ✓ | No |
| Scalability | Easy to scale | Mesh network issues |
| Latency | ~50-100ms | ~20-50ms |
| Anti-cheat | Possible | Difficult |
| Best for | 4-16 players | Voice/Video |

**Decision:** WebSocket for game, WebRTC for voice

### Why PostgreSQL + Redis?

**PostgreSQL:**
- Strong consistency
- Complex queries (stats, leaderboards)
- Relational data (users ↔ games ↔ stats)

**Redis:**
- Ultra-fast reads/writes
- Perfect for sessions
- Temporary lobby state
- Pub/Sub for real-time updates

### Why Godot for Web Games?

- ✅ Native HTML5/WebAssembly export
- ✅ Built-in WebSocket support
- ✅ Small bundle size
- ✅ Free and open-source
- ✅ Great 2D performance

**Alternative:** Unity WebGL (larger bundle, commercial)

---

## Security Considerations

### Authentication
- Passwords hashed with bcrypt (10 rounds)
- JWT tokens with expiration
- Sessions validated in Redis

### Game Security
- Server-authoritative game state
- Input validation on backend
- Rate limiting on API endpoints
- SQL injection prevention (parameterized queries)

### WebSocket Security
- Authentication required before joining
- User ID validation
- Action verification on server

### Production Additions Needed
- [ ] HTTPS/WSS (SSL certificates)
- [ ] CORS whitelist (not wildcard)
- [ ] Rate limiting (express-rate-limit)
- [ ] Input sanitization
- [ ] Database connection pooling limits
- [ ] DDoS protection (Cloudflare)

---

## Scaling Strategy

### Horizontal Scaling

**Current Setup:** Single server
**Production:** Multiple servers

```
         ┌───────────────┐
         │ Load Balancer │
         └───────┬───────┘
                 │
      ┏━━━━━━━━━━┻━━━━━━━━━━┓
      ▼                      ▼
┌──────────┐          ┌──────────┐
│ Server 1 │          │ Server 2 │
│ (HTTP +  │          │ (HTTP +  │
│  WS)     │          │  WS)     │
└────┬─────┘          └────┬─────┘
     │                     │
     └──────────┬──────────┘
                ▼
        ┌───────────────┐
        │ Shared Redis  │
        │ (Sticky       │
        │  Sessions)    │
        └───────────────┘
```

**WebSocket Sticky Sessions:**
- Use Redis adapter for Socket.io (alternative)
- Or: Consistent hashing in load balancer
- Players in same lobby → same server

### Database Scaling

**PostgreSQL:**
- Read replicas for stats/leaderboards
- Write master for game results
- Connection pooling (PgBouncer)

**Redis:**
- Redis Cluster for partitioning
- Separate instances for sessions vs lobbies

### CDN for Assets
- Host Godot build on CDN (Cloudflare, AWS CloudFront)
- Reduce latency for game loading
- Cached static assets

---

## Monitoring & Observability

### Metrics to Track

**Backend:**
- Request rate (req/sec)
- Response time (p50, p95, p99)
- WebSocket connections (active)
- Error rate

**Database:**
- Query time
- Connection pool usage
- Slow queries

**Game:**
- Active players
- Active lobbies
- Average match duration
- Kill/death ratios

### Tools

**Recommended:**
- **Logs:** Winston (Node.js) → Elasticsearch
- **Metrics:** Prometheus + Grafana
- **Errors:** Sentry
- **Uptime:** UptimeRobot

---

## Development Workflow

```
1. Backend Development
   └─> Change code in backend/src/
   └─> Nodemon auto-restarts
   └─> Test with Postman/curl

2. Frontend Development
   └─> Change code in frontend/src/
   └─> Vite hot-reloads
   └─> Test in browser

3. Godot Development
   └─> Edit scenes/scripts
   └─> Test in Godot (F5)
   └─> Export to HTML5
   └─> Copy to frontend/public/
   └─> Test in browser
```

---

## Deployment Architecture (Production)

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

## File Structure Reference

```
turbo-octo-guacamole/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js         # PostgreSQL connection
│   │   │   └── redis.js            # Redis connection + helpers
│   │   ├── middleware/
│   │   │   └── auth.js             # JWT verification
│   │   ├── routes/
│   │   │   ├── auth.js             # Login/Signup
│   │   │   ├── lobby.js            # Lobby management
│   │   │   └── profile.js          # User stats
│   │   ├── websocket/
│   │   │   └── gameServer.js       # WebSocket handlers
│   │   └── server.js               # Entry point
│   ├── db/
│   │   └── init.sql                # Database schema
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Signup.jsx
│   │   │   ├── Lobby.jsx
│   │   │   ├── Profile.jsx
│   │   │   └── Game.jsx
│   │   ├── services/
│   │   │   ├── api.js              # REST client
│   │   │   └── voiceChat.js        # WebRTC
│   │   ├── styles/
│   │   │   └── index.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   │   └── godot-game/             # Exported Godot build
│   ├── package.json
│   └── .env
│
├── godot-game/
│   ├── scenes/
│   │   ├── Main.tscn               # Game world
│   │   ├── Player.tscn             # Ship
│   │   └── Bullet.tscn             # Projectile
│   ├── scripts/
│   │   ├── NetworkManager.gd       # WS client
│   │   ├── GameManager.gd          # Game logic
│   │   ├── Player.gd               # Ship controller
│   │   └── Bullet.gd               # Bullet physics
│   ├── export/                     # HTML5 build output
│   └── project.godot               # Godot config
│
├── docker-compose.yml              # PostgreSQL + Redis
├── .gitignore
├── README.md                       # Overview
├── QUICK_START.md                  # Fast setup
├── SETUP.md                        # Detailed docs
├── ARCHITECTURE.md                 # This file
├── GODOT_SCENES_GUIDE.md           # Godot tutorial
└── VOICE_CHAT_IMPLEMENTATION.md    # WebRTC guide
```

---

**This architecture supports:**
- ✅ 4-player real-time multiplayer
- ✅ Multiple concurrent game sessions
- ✅ Voice chat
- ✅ Player authentication
- ✅ Stats tracking
- ✅ Server browser
- ✅ Web-based (no downloads)
- ✅ Scalable to hundreds of concurrent games

Ready to build! 🚀
