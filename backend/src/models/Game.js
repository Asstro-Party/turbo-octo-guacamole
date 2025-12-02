import { Player } from './Player.js';
import { Powerup, PowerupTypes } from './Powerup.js';

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
    this.playerInputs = {}; // userId -> latest input
    this.sessionId = null;
    this.gameOver = false; // Track if game has ended
    
    // Powerup system
    this.powerups = [];              // Active powerups on map
    this.mines = [];                 // Placed diaper mines
    this.gameStartTime = Date.now(); // Track when game started
    this.lastPowerupPickup = 0;      // Track when last powerup was picked up
    this.firstPowerupSpawned = false; // Track if first powerup has been spawned
    this.FIRST_POWERUP_DELAY = 10000;     // 10 seconds after game start
    this.POWERUP_PICKUP_DELAY = 5000;     // 5 seconds after pickup before next spawn

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
    this.KILLS_TO_WIN = 5;
    
    // Powerup spawn locations
    this.CENTER_SPAWN = { x: 640, y: 360 };  // Center of map (inside box)
    this.POWERUP_SPAWN_LOCATIONS = [
      { x: 640, y: 100 },   // Top center
      { x: 640, y: 620 },   // Bottom center
      { x: 100, y: 360 },   // Left center
      { x: 1180, y: 360 },  // Right center
    ];
  }

  /**
   * Initialize wall positions
   * @returns {Array} Array of wall objects
   */
  initializeWalls() {
    return [
      // TOP-LEFT CORNER (2x2 square)
      { id: 0, position: { x: 90, y: 40 }, health: 100, isHorizontal: true },
      { id: 1, position: { x: 190, y: 40 }, health: 100, isHorizontal: true },
      { id: 2, position: { x: 260, y: 80 }, health: 100, isHorizontal: false },
      { id: 3, position: { x: 260, y: 180 }, health: 100, isHorizontal: false },
      { id: 4, position: { x: 90, y: 240 }, health: 100, isHorizontal: true },
      { id: 5, position: { x: 190, y: 240 }, health: 100, isHorizontal: true },
      { id: 6, position: { x: 20, y: 80 }, health: 100, isHorizontal: false },
      { id: 7, position: { x: 20, y: 180 }, health: 100, isHorizontal: false },

      // TOP-RIGHT CORNER (mirrored from top-left, x = 1280 - x)
      { id: 8, position: { x: 1190, y: 40 }, health: 100, isHorizontal: true },   
      { id: 9, position: { x: 1090, y: 40 }, health: 100, isHorizontal: true },   
      { id: 10, position: { x: 1020, y: 80 }, health: 100, isHorizontal: false }, 
      { id: 11, position: { x: 1020, y: 180 }, health: 100, isHorizontal: false },
      { id: 12, position: { x: 1190, y: 240 }, health: 100, isHorizontal: true }, 
      { id: 13, position: { x: 1090, y: 240 }, health: 100, isHorizontal: true }, 
      { id: 14, position: { x: 1260, y: 80 }, health: 100, isHorizontal: false }, 
      { id: 15, position: { x: 1260, y: 180 }, health: 100, isHorizontal: false },

      // BOTTOM-LEFT CORNER (mirrored from top-left, y = 720 - y)
      { id: 16, position: { x: 90, y: 680 }, health: 100, isHorizontal: true },   
      { id: 17, position: { x: 190, y: 680 }, health: 100, isHorizontal: true },  
      { id: 18, position: { x: 260, y: 640 }, health: 100, isHorizontal: false },
      { id: 19, position: { x: 260, y: 540 }, health: 100, isHorizontal: false }, 
      { id: 20, position: { x: 90, y: 480 }, health: 100, isHorizontal: true },   
      { id: 21, position: { x: 190, y: 480 }, health: 100, isHorizontal: true },  
      { id: 22, position: { x: 20, y: 640 }, health: 100, isHorizontal: false },
      { id: 23, position: { x: 20, y: 540 }, health: 100, isHorizontal: false }, 

      // BOTTOM-RIGHT CORNER (mirrored from top-left, x = 1280 - x, y = 720 - y)
      { id: 24, position: { x: 1190, y: 680 }, health: 100, isHorizontal: true },
      { id: 25, position: { x: 1090, y: 680 }, health: 100, isHorizontal: true },
      { id: 26, position: { x: 1020, y: 640 }, health: 100, isHorizontal: false },
      { id: 27, position: { x: 1020, y: 540 }, health: 100, isHorizontal: false },
      { id: 28, position: { x: 1190, y: 480 }, health: 100, isHorizontal: true }, 
      { id: 29, position: { x: 1090, y: 480 }, health: 100, isHorizontal: true }, 
      { id: 30, position: { x: 1260, y: 640 }, health: 100, isHorizontal: false },
      { id: 31, position: { x: 1260, y: 540 }, health: 100, isHorizontal: false },

      // CENTER (2x2 square box like the corners)
      { id: 32, position: { x: 590, y: 310 }, health: 100, isHorizontal: true },   
      { id: 33, position: { x: 690, y: 310 }, health: 100, isHorizontal: true },   
      { id: 34, position: { x: 760, y: 350 }, health: 100, isHorizontal: false },  
      { id: 35, position: { x: 760, y: 450 }, health: 100, isHorizontal: false },  
      { id: 36, position: { x: 590, y: 510 }, health: 100, isHorizontal: true },   
      { id: 37, position: { x: 690, y: 510 }, health: 100, isHorizontal: true },   
      { id: 38, position: { x: 520, y: 350 }, health: 100, isHorizontal: false },  
      { id: 39, position: { x: 520, y: 450 }, health: 100, isHorizontal: false },  
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
   * @returns {boolean|Object} True if state changed, or {gameOver: true, winnerId} if game ends
   */
  update(dt, broadcastCallback) {
    // Don't update if game is over
    if (this.gameOver) {
      return false;
    }

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
          { 
            x: wall.position.x, 
            y: wall.position.y, 
            width: wall.isHorizontal ? this.WALL_HEIGHT : this.WALL_WIDTH,   
            height: wall.isHorizontal ? this.WALL_WIDTH : this.WALL_HEIGHT   
          }
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
      
      // Check if player's powerup has expired
      if (player.checkPowerupExpiration()) {
        stateChanged = true;
      }
    }

    // Update bullets
    stateChanged = this.updateBullets(dt, broadcastCallback) || stateChanged;

    // Server-side collision detection: bullets vs players
    const collisionResult = this.handleBulletPlayerCollisions(broadcastCallback);
    
    // Check if game ended
    if (collisionResult && typeof collisionResult === 'object' && collisionResult.gameOver) {
      this.gameOver = true;
      return collisionResult;
    }
    
    stateChanged = collisionResult || stateChanged;

    // Check mine triggers
    this.checkMineTriggers(broadcastCallback);
    
    // Handle powerup spawning
    stateChanged = this.updatePowerups(broadcastCallback) || stateChanged;

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
          { 
            x: wall.position.x, 
            y: wall.position.y, 
            width: wall.isHorizontal ? this.WALL_HEIGHT : this.WALL_WIDTH, 
            height: wall.isHorizontal ? this.WALL_WIDTH : this.WALL_HEIGHT 
          }
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
   * @returns {boolean|Object} True if state changed, or {gameOver: true, winnerId} if game ends
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

            // Update kill/death counters (server-authoritative)
            if (shooter) {
              shooter.addKill();
            }
            player.deaths++;

            // Broadcast kill event
            broadcastCallback({
              type: 'kill',
              killerId: bullet.shooterId,
              victimId: userId,
              timestamp: now
            });

            // Respawn the victim at a random safe position
            const randomPos = this.findRandomSafePosition(userId);
            player.respawn(randomPos);

            // Check for win condition
            if (shooter && shooter.kills >= this.KILLS_TO_WIN) {
              // Game over - someone won!
              console.log(`[Game ${this.gameId}] WIN CONDITION MET! Winner: ${bullet.shooterId} with ${shooter.kills} kills`);
              return { gameOver: true, winnerId: bullet.shooterId };
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
   * Find a random safe position for respawning
   * @param {number} excludeUserId - User ID to exclude from collision check
   * @returns {Object} Safe position {x, y}
   */
  findRandomSafePosition(excludeUserId) {
    const SAFE_MARGIN = 50; // Minimum distance from edges
    const MAX_ATTEMPTS = 100;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Generate random position within game bounds with margin
      const x = SAFE_MARGIN + Math.random() * (this.GAME_WIDTH - 2 * SAFE_MARGIN);
      const y = SAFE_MARGIN + Math.random() * (this.GAME_HEIGHT - 2 * SAFE_MARGIN);

      // Check collision with walls
      let collidesWithWall = false;
      for (const wall of this.walls) {
        if (!wall || wall.health <= 0) continue;

        const collision = this.checkCircleRectCollision(
          { x, y, radius: this.PLAYER_RADIUS },
          { 
            x: wall.position.x, 
            y: wall.position.y, 
            width: wall.isHorizontal ? this.WALL_HEIGHT : this.WALL_WIDTH, 
            height: wall.isHorizontal ? this.WALL_WIDTH : this.WALL_HEIGHT 
          }
        );

        if (collision) {
          collidesWithWall = true;
          break;
        }
      }

      if (collidesWithWall) continue;

      // Check collision with other players
      let collidesWithPlayer = false;
      const MIN_PLAYER_DISTANCE = this.PLAYER_RADIUS * 3; // 3x player radius for safe distance

      for (const [userId, player] of this.players) {
        if (userId === excludeUserId) continue; // Don't check against self
        if (!player || !player.position) continue;

        const dx = x - player.position.x;
        const dy = y - player.position.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < MIN_PLAYER_DISTANCE * MIN_PLAYER_DISTANCE) {
          collidesWithPlayer = true;
          break;
        }
      }

      if (collidesWithPlayer) continue;

      // Found a safe position!
      console.log(`[Game ${this.gameId}] Found safe respawn position at (${Math.round(x)}, ${Math.round(y)}) after ${attempt + 1} attempts`);
      return { x, y };
    }

    // Fallback to center if no safe position found (very rare)
    console.warn(`[Game ${this.gameId}] Could not find safe position after ${MAX_ATTEMPTS} attempts, using center`);
    return { x: this.GAME_WIDTH / 2, y: this.GAME_HEIGHT / 2 };
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

    // Serialize mines without timeout properties
    const serializedMines = this.mines.map(mine => ({
      id: mine.id,
      ownerId: mine.ownerId,
      position: mine.position,
      armed: mine.armed,
      placedAt: mine.placedAt
    }));

    return {
      players: playersState,
      bullets: this.bullets,
      walls: this.walls,
      powerups: this.powerups.map(p => p.getState()),
      mines: serializedMines
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

  /**
   * Update powerup spawning
   * @param {Function} broadcastCallback
   * @returns {boolean}
   */
  updatePowerups(broadcastCallback) {
    const now = Date.now();
    
    // Only spawn if no powerups exist
    if (this.powerups.length > 0) {
      return false;
    }
    
    // First powerup: spawn 10 seconds after game start
    if (!this.firstPowerupSpawned) {
      const timeSinceGameStart = now - this.gameStartTime;
      if (timeSinceGameStart > this.FIRST_POWERUP_DELAY) {
        this.spawnRandomPowerup(broadcastCallback, true);
        return true;
      }
      return false;
    }
    
    // Subsequent powerups: wait 5 seconds after last pickup
    const timeSincePickup = now - this.lastPowerupPickup;
    if (timeSincePickup > this.POWERUP_PICKUP_DELAY) {
      this.spawnRandomPowerup(broadcastCallback, false);
      return true;
    }
    
    return false;
  }

  /**
   * Spawn a random powerup
   * @param {Function} broadcastCallback
   * @param {boolean} isFirst - Is this the first powerup?
   */
  spawnRandomPowerup(broadcastCallback, isFirst = false) {
    const types = Object.keys(PowerupTypes);
    const randomType = types[Math.floor(Math.random() * types.length)];
    
    // First powerup always spawns in center, others spawn randomly
    const spawnLocation = isFirst 
      ? this.CENTER_SPAWN
      : this.POWERUP_SPAWN_LOCATIONS[Math.floor(Math.random() * this.POWERUP_SPAWN_LOCATIONS.length)];
    
    const powerup = new Powerup(randomType, spawnLocation);
    this.powerups.push(powerup);
    
    if (isFirst) {
      this.firstPowerupSpawned = true;
      console.log(`[Game ${this.gameId}] Spawned FIRST powerup (${randomType}) at CENTER (${spawnLocation.x}, ${spawnLocation.y})`);
    } else {
      console.log(`[Game ${this.gameId}] Spawned ${randomType} at (${spawnLocation.x}, ${spawnLocation.y})`);
    }
    
    broadcastCallback({
      type: 'powerup_spawned',
      powerup: powerup.getState()
    });
  }

  /**
   * Handle powerup pickup
   * @param {number} userId
   * @param {string} powerupId
   */
  handlePowerupPickup(userId, powerupId) {
    const player = this.players.get(userId);
    if (!player) return false;
    
    // Check if player already has a powerup
    if (player.powerup) {
      console.log(`[Game ${this.gameId}] Player ${userId} already has a powerup: ${player.powerup}`);
      return false;
    }
    
    const powerupIndex = this.powerups.findIndex(p => p.id === powerupId);
    if (powerupIndex === -1) return false;
    
    const powerup = this.powerups[powerupIndex];
    if (powerup.collected) return false;
    
    // Check if player is close enough
    const dx = player.position.x - powerup.position.x;
    const dy = player.position.y - powerup.position.y;
    const distSq = dx * dx + dy * dy;
    
    if (distSq > 50 * 50) return false; // Must be within 50 units
    
    // Give powerup to player
    player.pickupPowerup(powerup.type);
    this.powerups.splice(powerupIndex, 1);
    
    // Track pickup time for spawn delay
    this.lastPowerupPickup = Date.now();
    
    console.log(`[Game ${this.gameId}] Player ${userId} picked up ${powerup.type}`);
    
    return true;
  }

  /**
   * Handle powerup usage
   * @param {number} userId
   * @param {Object} usageData - {rotation, position}
   * @param {Function} broadcastCallback
   */
  handlePowerupUse(userId, usageData, broadcastCallback) {
    const player = this.players.get(userId);
    if (!player || !player.powerup) return;
    
    const powerupType = player.powerup;
    
    if (!player.usePowerup()) return;
    
    switch (powerupType) {
      case 'DIARRHEA_LASER':
        this.handleDiarrheaLaser(userId, usageData, broadcastCallback);
        break;
      case 'PLUNGER_MELEE':
        this.handlePlungerMelee(userId, usageData, broadcastCallback);
        break;
      case 'DIAPER_MINES':
        this.handleDiaperMine(userId, usageData, broadcastCallback);
        break;
    }
  }

  /**
   * Handle diarrhea laser
   */
  handleDiarrheaLaser(userId, usageData, broadcastCallback) {
    const player = this.players.get(userId);
    const config = PowerupTypes.DIARRHEA_LASER;
    
    broadcastCallback({
      type: 'laser_activated',
      userId,
      position: player.position,
      rotation: usageData.rotation,
      duration: config.duration
    });
    
    // Start laser damage ticks
    const laserInterval = setInterval(() => {
      this.applyLaserDamage(userId, usageData.rotation, broadcastCallback);
    }, config.tickRate);
    
    setTimeout(() => {
      clearInterval(laserInterval);
      broadcastCallback({
        type: 'laser_deactivated',
        userId
      });
    }, config.duration);
  }

  /**
   * Apply laser damage to players in laser path
   */
  applyLaserDamage(userId, rotation, broadcastCallback) {
    const shooter = this.players.get(userId);
    if (!shooter) return;
    
    const config = PowerupTypes.DIARRHEA_LASER;
    const laserEnd = {
      x: shooter.position.x + Math.cos(rotation) * config.range,
      y: shooter.position.y + Math.sin(rotation) * config.range
    };
    
    // Check each player for laser hit
    for (const [targetId, target] of this.players) {
      if (targetId === userId) continue;
      
      // Check if player intersects with laser line
      const dist = this.pointToLineDistance(
        target.position,
        shooter.position,
        laserEnd
      );
      
      if (dist < this.PLAYER_RADIUS) {
        const died = target.takeDamage(config.damage);
        
        if (died) {
          shooter.addKill();
          target.deaths++;
          
          broadcastCallback({
            type: 'kill',
            killerId: userId,
            victimId: targetId,
            timestamp: Date.now()
          });
          
          // Respawn victim
          const randomPos = this.findRandomSafePosition(targetId);
          target.respawn(randomPos);
          
          // Check win condition
          if (shooter.kills >= this.KILLS_TO_WIN) {
            return { gameOver: true, winnerId: userId };
          }
        }
      }
    }
  }

  /**
   * Handle plunger melee
   */
  handlePlungerMelee(userId, usageData, broadcastCallback) {
    const player = this.players.get(userId);
    const config = PowerupTypes.PLUNGER_MELEE;
    
    // Check for players in melee range
    for (const [targetId, target] of this.players) {
      if (targetId === userId) continue;
      
      const dx = target.position.x - player.position.x;
      const dy = target.position.y - player.position.y;
      const distSq = dx * dx + dy * dy;
      
      if (distSq <= config.range * config.range) {
        const died = target.takeDamage(config.damage);
        
        // Apply knockback
        const angle = Math.atan2(dy, dx);
        target.position.x += Math.cos(angle) * config.knockback * 0.016; // dt estimate
        target.position.y += Math.sin(angle) * config.knockback * 0.016;
        
        if (died) {
          player.addKill();
          target.deaths++;
          
          broadcastCallback({
            type: 'kill',
            killerId: userId,
            victimId: targetId,
            timestamp: Date.now()
          });
          
          const randomPos = this.findRandomSafePosition(targetId);
          target.respawn(randomPos);
        }
      }
    }
    
    broadcastCallback({
      type: 'plunger_used',
      userId,
      position: player.position,
      rotation: usageData.rotation
    });
  }

  /**
   * Handle diaper mine placement
   */
  handleDiaperMine(userId, usageData, broadcastCallback) {
    const player = this.players.get(userId);
    const config = PowerupTypes.DIAPER_MINES;
    
    const mine = {
      id: Date.now().toString() + Math.random(),
      ownerId: userId,
      position: { ...player.position },
      armed: false,
      placedAt: Date.now(),
      armTimeout: null,
      expireTimeout: null
    };
    
    // Arm after delay
    mine.armTimeout = setTimeout(() => {
      // Check if mine still exists
      const stillExists = this.mines.some(m => m.id === mine.id);
      if (!stillExists) return;
      
      mine.armed = true;
      broadcastCallback({
        type: 'mine_armed',
        mineId: mine.id
      });
    }, config.armTime);
    
    // Remove after lifetime
    mine.expireTimeout = setTimeout(() => {
      const index = this.mines.findIndex(m => m.id === mine.id);
      if (index !== -1) {
        const mineToRemove = this.mines[index];
        // Clear any pending timeouts
        if (mineToRemove.armTimeout) clearTimeout(mineToRemove.armTimeout);
        if (mineToRemove.expireTimeout) clearTimeout(mineToRemove.expireTimeout);
        
        this.mines.splice(index, 1);
        broadcastCallback({
          type: 'mine_expired',
          mineId: mine.id
        });
      }
    }, config.lifetime);
    
    this.mines.push(mine);
    
    // Send mine data without timeout properties (can't serialize)
    broadcastCallback({
      type: 'mine_placed',
      mine: {
        id: mine.id,
        ownerId: mine.ownerId,
        position: mine.position,
        armed: mine.armed,
        placedAt: mine.placedAt
      }
    });
  }

  /**
   * Check mine triggers (call this in update loop)
   */
  checkMineTriggers(broadcastCallback) {
    const config = PowerupTypes.DIAPER_MINES;
    
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i];
      if (!mine.armed) continue;
      
      for (const [targetId, target] of this.players) {
        const dx = target.position.x - mine.position.x;
        const dy = target.position.y - mine.position.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq <= config.triggerRadius * config.triggerRadius) {
          // Mine triggered!
          const died = target.takeDamage(config.damage);
          
          if (died) {
            const owner = this.players.get(mine.ownerId);
            if (owner) owner.addKill();
            target.deaths++;
            
            broadcastCallback({
              type: 'kill',
              killerId: mine.ownerId,
              victimId: targetId,
              timestamp: Date.now()
            });
            
            const randomPos = this.findRandomSafePosition(targetId);
            target.respawn(randomPos);
          }
          
          broadcastCallback({
            type: 'mine_triggered',
            mineId: mine.id,
            position: mine.position,
            victimId: targetId
          });
          
          // Clear any pending timeouts before removing
          if (mine.armTimeout) clearTimeout(mine.armTimeout);
          if (mine.expireTimeout) clearTimeout(mine.expireTimeout);
          
          this.mines.splice(i, 1);
          break;
        }
      }
    }
  }

  /**
   * Point to line distance helper
   */
  pointToLineDistance(point, lineStart, lineEnd) {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;
    
    let xx, yy;
    
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
