import { Player } from './Player.js';

/**
 * Game class - Represents a single game instance with 0-4 players
 */
export class Game {
  constructor(gameId, lobbyId) {
    this.gameId = gameId;
    this.lobbyId = lobbyId;
    this.players = new Map(); // userId -> Player instance
    this.bullets = [];
    this.walls = this.initializeWalls();
    this.portals = [];
    this.lastPortalSpawn = Date.now();
    this.playerInputs = {}; // userId -> latest input
    this.sessionId = null;

    // Game configuration
    this.GAME_WIDTH = 1280;
    this.GAME_HEIGHT = 720;
    this.PLAYER_RADIUS = 25;
    this.WALL_WIDTH = 40;
    this.WALL_HEIGHT = 100;
    this.BULLET_RADIUS = 10;
    this.BULLET_SPEED = 600;
    this.BULLET_DAMAGE = 50;
    this.HIT_RADIUS = 20;
    this.PORTAL_SPAWN_INTERVAL = 20000; // 20 seconds
    this.PORTAL_LIFETIME = 15000; // 15 seconds
    this.KILLS_TO_WIN = 5;
  }

  /**
   * Initialize wall positions
   * @returns {Array} Array of wall objects
   */
  initializeWalls() {
    return [
      // TOP-LEFT CORNER (2x2 square)
      { id: 0, position: { x: 50, y: 40 }, health: 100, isHorizontal: true },
      { id: 1, position: { x: 150, y: 40 }, health: 100, isHorizontal: true },
      { id: 2, position: { x: 220, y: 80 }, health: 100, isHorizontal: false },
      { id: 3, position: { x: 220, y: 180 }, health: 100, isHorizontal: false },
      { id: 4, position: { x: 50, y: 240 }, health: 100, isHorizontal: true },
      { id: 5, position: { x: 150, y: 240 }, health: 100, isHorizontal: true },
      { id: 6, position: { x: 1160, y: 40 }, health: 100, isHorizontal: false },
      { id: 7, position: { x: 1200, y: 125 }, health: 100, isHorizontal: false },

      // BOTTOM-LEFT CORNER (2x2 square)
      { id: 8, position: { x: 180, y: 650 }, health: 100, isHorizontal: false },
      { id: 9, position: { x: 140, y: 625 }, health: 100, isHorizontal: false },
      { id: 10, position: { x: 180, y: 600 }, health: 100, isHorizontal: false },
      { id: 11, position: { x: 220, y: 625 }, health: 100, isHorizontal: false },

      // BOTTOM-RIGHT CORNER (2x2 square)
      { id: 12, position: { x: 1160, y: 550 }, health: 100, isHorizontal: false },
      { id: 13, position: { x: 1140, y: 550 }, health: 100, isHorizontal: false },
      { id: 14, position: { x: 1160, y: 700 }, health: 100, isHorizontal: false },
      { id: 15, position: { x: 1140, y: 700 }, health: 100, isHorizontal: false },

      // CENTER (2x2 square)
      { id: 16, position: { x: 520, y: 280 }, health: 100, isHorizontal: false },
      { id: 17, position: { x: 720, y: 280 }, health: 100, isHorizontal: false },
      { id: 18, position: { x: 520, y: 420 }, health: 100, isHorizontal: false },
      { id: 19, position: { x: 720, y: 420 }, health: 100, isHorizontal: false },
    ];
  }

  /**
   * Add a player to the game
   * @param {number} userId - User ID
   * @param {string} username - Username
   * @param {number} spawnIndex - Spawn position index
   * @returns {Player} The created player instance
   */
  addPlayer(userId, username, spawnIndex) {
    const spawnPositions = Player.getSpawnPositions();
    const spawnPos = spawnPositions[spawnIndex % spawnPositions.length];
    const player = new Player(userId, username, spawnPos, spawnIndex);
    this.players.set(userId, player);
    console.log(`[Game ${this.gameId}] Added player ${userId} at spawn ${spawnIndex + 1} (${spawnPos.x}, ${spawnPos.y})`);
    return player;
  }

  /**
   * Remove a player from the game
   * @param {number} userId - User ID
   */
  removePlayer(userId) {
    this.players.delete(userId);
    delete this.playerInputs[userId];
    console.log(`[Game ${this.gameId}] Removed player ${userId}`);
  }

  /**
   * Get player by userId
   * @param {number} userId - User ID
   * @returns {Player|undefined} Player instance or undefined
   */
  getPlayer(userId) {
    return this.players.get(userId);
  }

  /**
   * Handle player input
   * @param {number} userId - User ID
   * @param {Object} input - Player input
   */
  handlePlayerInput(userId, input) {
    this.playerInputs[userId] = input;

    // Handle shoot input
    if (input && input.shoot) {
      this.createBullet(userId, input.shoot);
    }
  }

  /**
   * Create a bullet
   * @param {number} userId - Shooter's user ID
   * @param {Object} shootData - Shoot data (position, rotation)
   */
  createBullet(userId, shootData) {
    const shooter = this.players.get(userId);
    if (!shooter) return;

    const pos = shootData.position;
    const rot = shootData.rotation;

    if (!isFinite(rot) || isNaN(rot)) {
      console.warn('Invalid rotation received from client:', rot);
      return;
    }

    const bulletId = Date.now().toString() + Math.floor(Math.random() * 10000);
    const bulletObj = {
      id: bulletId,
      position: { x: pos.x, y: pos.y },
      velocity: {
        x: Math.cos(rot) * this.BULLET_SPEED,
        y: Math.sin(rot) * this.BULLET_SPEED
      },
      rotation: rot,
      shooterId: userId,
      createdAt: Date.now()
    };
    this.bullets.push(bulletObj);
  }

  /**
   * Check if a circle collides with a rectangle (AABB collision)
   * @param {Object} circle - {x, y, radius}
   * @param {Object} rect - {x, y, width, height}
   * @returns {boolean}
   */
  checkCircleRectCollision(circle, rect) {
    const closestX = Math.max(rect.x - rect.width / 2, Math.min(circle.x, rect.x + rect.width / 2));
    const closestY = Math.max(rect.y - rect.height / 2, Math.min(circle.y, rect.y + rect.height / 2));

    const distanceX = circle.x - closestX;
    const distanceY = circle.y - closestY;
    const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

    return distanceSquared < (circle.radius * circle.radius);
  }

  /**
   * Update game state (called by game loop)
   * @param {number} dt - Delta time in seconds
   * @param {Function} broadcastCallback - Callback to broadcast events
   * @returns {boolean} True if state changed
   */
  update(dt, broadcastCallback) {
    let stateChanged = false;

    // Update each player's state based on their input
    for (const [userId, player] of this.players) {
      const input = this.playerInputs[userId];
      const { oldX, oldY, oldRot, newX, newY } = player.updateFromInput(input, dt);

      // Check collision with walls
      let canMove = true;
      for (const wall of this.walls) {
        if (!wall || wall.health <= 0) continue;

        const collision = this.checkCircleRectCollision(
          { x: newX, y: newY, radius: this.PLAYER_RADIUS },
          { x: wall.position.x, y: wall.position.y, width: this.WALL_WIDTH, height: this.WALL_HEIGHT }
        );

        if (collision) {
          canMove = false;
          break;
        }
      }

      // Update position if no collision
      if (canMove) {
        player.updatePosition(newX, newY, this.GAME_WIDTH, this.GAME_HEIGHT);
      } else {
        stateChanged = true; // Still mark as changed to sync clients
      }

      // Track if player state changed
      if (player.hasStateChanged(oldX, oldY, oldRot)) {
        stateChanged = true;
      }
    }

    // Update bullets
    stateChanged = this.updateBullets(dt, broadcastCallback) || stateChanged;

    // Server-side collision detection: bullets vs players
    stateChanged = this.handleBulletPlayerCollisions(broadcastCallback) || stateChanged;

    // Handle portal spawning
    stateChanged = this.updatePortals(broadcastCallback) || stateChanged;

    return stateChanged;
  }

  /**
   * Update bullet positions and handle bullet-wall collisions
   * @param {number} dt - Delta time in seconds
   * @param {Function} broadcastCallback - Callback to broadcast events
   * @returns {boolean} True if state changed
   */
  updateBullets(dt, broadcastCallback) {
    let stateChanged = false;
    const now = Date.now();

    // Use in-place filtering for better performance
    let writeIdx = 0;
    for (let readIdx = 0; readIdx < this.bullets.length; readIdx++) {
      const bullet = this.bullets[readIdx];
      bullet.position.x += bullet.velocity.x * dt;
      bullet.position.y += bullet.velocity.y * dt;

      // Check bullet-wall collision
      let bulletHitWall = false;
      for (let wi = this.walls.length - 1; wi >= 0; wi--) {
        const wall = this.walls[wi];
        if (!wall || wall.health <= 0) continue;

        const collision = this.checkCircleRectCollision(
          { x: bullet.position.x, y: bullet.position.y, radius: this.BULLET_RADIUS },
          { x: wall.position.x, y: wall.position.y, width: this.WALL_WIDTH, height: this.WALL_HEIGHT }
        );

        if (collision) {
          // Damage the wall
          wall.health -= 25;
          console.log(`[Game ${this.gameId}] Bullet hit wall ${wi}, health: ${wall.health}`);

          // Remove wall if destroyed
          if (wall.health <= 0) {
            console.log(`[Game ${this.gameId}] Wall ${wall.id} destroyed!`);
            broadcastCallback({ type: 'wall_destroyed', wallId: wall.id });
            this.walls.splice(wi, 1);
          }

          bulletHitWall = true;
          stateChanged = true;
          break;
        }
      }

      if (bulletHitWall) {
        continue; // Skip this bullet (effectively removes it)
      }

      // Remove bullets that go off screen or are too old
      if (bullet.position.x < 0 || bullet.position.x > this.GAME_WIDTH ||
        bullet.position.y < 0 || bullet.position.y > this.GAME_HEIGHT ||
        now - bullet.createdAt > 2000) {
        stateChanged = true;
        continue;
      }

      // Keep this bullet
      if (writeIdx !== readIdx) {
        this.bullets[writeIdx] = bullet;
      }
      writeIdx++;
    }
    this.bullets.length = writeIdx;

    return stateChanged;
  }

  /**
   * Handle bullet-player collisions
   * @param {Function} broadcastCallback - Callback to broadcast events
   * @returns {boolean} True if state changed
   */
  handleBulletPlayerCollisions(broadcastCallback) {
    let stateChanged = false;
    const now = Date.now();
    const HIT_RADIUS_SQ = this.HIT_RADIUS * this.HIT_RADIUS;

    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const bullet = this.bullets[bi];
      if (!bullet || !bullet.position || typeof bullet.shooterId === 'undefined') continue;

      let bulletHit = false;
      for (const [userId, player] of this.players) {
        if (userId === bullet.shooterId) continue; // don't hit shooter
        if (!player || !player.position) continue;

        const dx = bullet.position.x - player.position.x;
        const dy = bullet.position.y - player.position.y;
        if (dx * dx + dy * dy <= HIT_RADIUS_SQ) {
          // Hit detected - apply damage
          const died = player.takeDamage(this.BULLET_DAMAGE);
          stateChanged = true;

          // Remove the bullet
          this.bullets.splice(bi, 1);

          // Handle player death
          if (died) {
            const shooter = this.players.get(bullet.shooterId);
            if (shooter) {
              shooter.addKill();
            }

            // Broadcast kill event
            broadcastCallback({
              type: 'kill',
              killerId: bullet.shooterId,
              victimId: userId,
              timestamp: now
            });

            // Check for win condition
            if (shooter && shooter.kills >= this.KILLS_TO_WIN) {
              // Game over - someone won!
              return { gameOver: true, winnerId: bullet.shooterId };
            } else {
              // Respawn player
              player.respawn(Player.getSpawnPositions());
            }
          }

          bulletHit = true;
          break;
        }
      }

      if (bulletHit) continue;
    }

    return stateChanged;
  }

  /**
   * Update portal spawning
   * @param {Function} broadcastCallback - Callback to broadcast events
   * @returns {boolean} True if state changed
   */
  updatePortals(broadcastCallback) {
    const now = Date.now();

    if (this.portals.length === 0 && now - this.lastPortalSpawn > this.PORTAL_SPAWN_INTERVAL) {
      this.spawnPortals(broadcastCallback);
      return true;
    }

    return false;
  }

  /**
   * Spawn portals
   * @param {Function} broadcastCallback - Callback to broadcast events
   */
  spawnPortals(broadcastCallback) {
    const portalSpawnLocations = [
      { x: 150, y: 100 },
      { x: 1130, y: 100 },
      { x: 100, y: 360 },
      { x: 1180, y: 360 },
      { x: 150, y: 620 },
      { x: 1130, y: 620 },
      { x: 640, y: 100 },
      { x: 640, y: 620 }
    ];

    const shuffled = [...portalSpawnLocations].sort(() => Math.random() - 0.5);
    const portal1 = { id: 0, position: shuffled[0] };
    const portal2 = { id: 1, position: shuffled[1] };

    this.portals = [portal1, portal2];
    this.lastPortalSpawn = Date.now();

    console.log(`[Game ${this.gameId}] Spawned portals at:`, portal1.position, portal2.position);

    broadcastCallback({
      type: 'portals_spawned',
      portals: this.portals
    });

    // Schedule portal removal
    setTimeout(() => {
      this.portals = [];
      console.log(`[Game ${this.gameId}] Removed portals`);
      broadcastCallback({ type: 'portals_removed' });
    }, this.PORTAL_LIFETIME);
  }

  /**
   * Teleport a player
   * @param {number} userId - User ID
   * @param {Object} position - Target position {x, y}
   */
  teleportPlayer(userId, position) {
    const player = this.players.get(userId);
    if (player) {
      player.teleport(position.x, position.y);
    }
  }

  /**
   * Get game state for broadcasting
   * @returns {Object} Game state object
   */
  getState() {
    const playersState = {};
    for (const [userId, player] of this.players) {
      playersState[userId] = player.getState();
    }

    return {
      players: playersState,
      bullets: this.bullets,
      walls: this.walls,
      portals: this.portals
    };
  }

  /**
   * Get player count
   * @returns {number} Number of players
   */
  getPlayerCount() {
    return this.players.size;
  }

  /**
   * Check if game is full
   * @returns {boolean} True if game has 4 players
   */
  isFull() {
    return this.players.size >= 4;
  }

  /**
   * Check if game is empty
   * @returns {boolean} True if game has no players
   */
  isEmpty() {
    return this.players.size === 0;
  }
}
