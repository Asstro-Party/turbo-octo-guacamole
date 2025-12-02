import { PowerupTypes } from './Powerup.js';

/**
 * Player class - Represents a player in the game
 */
export class Player {
  constructor(userId, username, spawnPosition, spawnIndex) {
    this.userId = userId;
    this.username = username;
    this.position = { x: spawnPosition.x, y: spawnPosition.y };
    this.rotation = 0;
    this.velocity = { x: 0, y: 0 };
    this.health = 100;
    this.speed = 200;
    this.rotationSpeed = Math.PI; // radians/sec
    this.forwardSpeed = this.speed * 0.5;
    this.kills = 0;
    this.deaths = 0;
    this.spawnIndex = spawnIndex;
    
    // Powerup properties
    this.powerup = null;           // Current powerup
    this.powerupCharges = 0;       // For multi-use powerups like mines
    this.powerupLastUsed = 0;      // Cooldown tracking
    this.powerupExpires = 0;       // When powerup expires
  }

  /**
   * Update player state based on input
   * @param {Object} input - Player input (rotation, etc.)
   * @param {number} dt - Delta time in seconds
   */
  updateFromInput(input, dt) {
    // Defensive checks
    if (!this.position) this.position = { x: 100, y: 100 };
    if (typeof this.rotation !== 'number') this.rotation = 0;
    if (typeof this.speed !== 'number') this.speed = 200;

    const oldX = this.position.x;
    const oldY = this.position.y;
    const oldRot = this.rotation;

    if (input) {
      // Apply incremental clockwise rotation if present
      if (typeof input.rotation === 'number') {
        this.rotation += input.rotation * this.rotationSpeed * dt;

        // Normalize rotation to prevent infinity (keep between -2π and 2π)
        const TWO_PI = Math.PI * 2;
        while (this.rotation > TWO_PI) this.rotation -= TWO_PI;
        while (this.rotation < -TWO_PI) this.rotation += TWO_PI;

        // Ensure it's a valid number
        if (!isFinite(this.rotation)) {
          this.rotation = 0;
        }
      }
    }

    return {
      oldX,
      oldY,
      oldRot,
      newX: this.position.x + Math.cos(this.rotation) * this.forwardSpeed * dt,
      newY: this.position.y + Math.sin(this.rotation) * this.forwardSpeed * dt
    };
  }

  /**
   * Update player position
   * @param {number} x - New x position
   * @param {number} y - New y position
   * @param {number} gameWidth - Game width for wrapping
   * @param {number} gameHeight - Game height for wrapping
   */
  updatePosition(x, y, gameWidth, gameHeight) {
    this.position.x = x;
    this.position.y = y;

    // Wrap around screen edges
    this.position.x = (this.position.x + gameWidth) % gameWidth;
    this.position.y = (this.position.y + gameHeight) % gameHeight;
  }

  /**
   * Teleport player to a specific position
   * @param {number} x - Target x position
   * @param {number} y - Target y position
   */
  teleport(x, y) {
    this.position.x = x;
    this.position.y = y;
    console.log(`Player ${this.userId} teleported to (${x}, ${y})`);
  }

  /**
   * Apply damage to player
   * @param {number} damage - Amount of damage to apply
   * @returns {boolean} True if player died
   */
  takeDamage(damage) {
    this.health = Math.max(0, this.health - damage);
    return this.health <= 0;
  }

  /**
   * Respawn player at a given position
   * @param {Object} position - Position to respawn at {x, y}
   * Note: Death counting is handled separately in gameServer.js:handleKill()
   */
  respawn(position) {
    this.health = 100;
    this.position.x = position.x;
    this.position.y = position.y;
    console.log(`Player ${this.userId} respawned at (${Math.round(position.x)}, ${Math.round(position.y)})`);
  }

  /**
   * Increment kill count
   */
  addKill() {
    this.kills++;
  }

  /**
   * Check if player has position changed
   * @param {number} oldX - Old x position
   * @param {number} oldY - Old y position
   * @param {number} oldRot - Old rotation
   * @returns {boolean} True if state changed
   */
  hasStateChanged(oldX, oldY, oldRot) {
    return this.position.x !== oldX ||
           this.position.y !== oldY ||
           this.rotation !== oldRot;
  }

  /**
   * Get player state for broadcasting
   * @returns {Object} Player state object
   */
  getState() {
    return {
      position: { x: this.position.x, y: this.position.y },
      rotation: this.rotation,
      velocity: { x: this.velocity.x, y: this.velocity.y },
      health: this.health,
      speed: this.speed,
      kills: this.kills,
      deaths: this.deaths,
      username: this.username,
      powerup: this.getPowerupState()
    };
  }

  /**
   * Pick up a powerup
   * @param {string} powerupType - Type of powerup
   */
  pickupPowerup(powerupType) {
    this.powerup = powerupType;
    const config = PowerupTypes[powerupType];
    
    if (config) {
      this.powerupCharges = config.charges || 1;
      this.powerupExpires = config.duration ? Date.now() + config.duration : 0;
    }
  }

  /**
   * Use the current powerup
   * @returns {boolean} True if powerup was used
   */
  usePowerup() {
    if (!this.powerup) return false;
    
    const config = PowerupTypes[this.powerup];
    if (!config) return false;
    
    // Check cooldown
    const now = Date.now();
    if (now - this.powerupLastUsed < config.cooldown) {
      return false;
    }
    
    // Check expiration
    if (this.powerupExpires > 0 && now > this.powerupExpires) {
      this.clearPowerup();
      return false;
    }
    
    this.powerupLastUsed = now;
    
    // Reduce charges
    if (config.charges) {
      this.powerupCharges--;
      if (this.powerupCharges <= 0) {
        this.clearPowerup();
      }
    } else {
      // Single-use powerup
      this.clearPowerup();
    }
    
    return true;
  }

  /**
   * Clear current powerup
   */
  clearPowerup() {
    this.powerup = null;
    this.powerupCharges = 0;
    this.powerupExpires = 0;
  }

  /**
   * Get powerup state
   */
  getPowerupState() {
    return {
      type: this.powerup,
      charges: this.powerupCharges,
      expires: this.powerupExpires,
      cooldownReady: Date.now() - this.powerupLastUsed
    };
  }

  /**
   * Get fixed spawn positions for 4 players
   * @returns {Array} Array of spawn position objects
   */
  static getSpawnPositions() {
    return [
      { x: 140, y: 140 },   // Player 1: Top-Left box center
      { x: 1140, y: 140 },  // Player 2: Top-Right box center
      { x: 1140, y: 580 },  // Player 3: Bottom-Right box center
      { x: 140, y: 580 }    // Player 4: Bottom-Left box center
    ];
  }
}
