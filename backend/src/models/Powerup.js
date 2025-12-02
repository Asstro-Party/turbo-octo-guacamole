/**
 * Powerup types and their properties
 */
export const PowerupTypes = {
  DIARRHEA_LASER: {
    id: 'DIARRHEA_LASER',
    name: 'Diarrhea Laser',
    duration: 5000,        // 5 seconds of laser beam
    damage: 10,            // Damage per tick
    range: 400,            // Laser range
    tickRate: 100,         // Damage every 100ms
    cooldown: 0            // No cooldown, single use
  },
  PLUNGER_MELEE: {
    id: 'PLUNGER_MELEE',
    name: 'Plunger Melee',
    damage: 75,            // High damage melee hit
    range: 80,             // Melee range
    knockback: 200,        // Knockback force
    cooldown: 1000,        // 1 second between swings
    duration: 10000        // 10 seconds before powerup expires
  },
  DIAPER_MINES: {
    id: 'DIAPER_MINES',
    name: 'Diaper Mines',
    charges: 3,            // 3 mines to place
    damage: 50,            // Damage per mine
    armTime: 1000,         // 1 second to arm
    triggerRadius: 50,     // Trigger distance
    lifetime: 30000        // Mines last 30 seconds
  }
};

/**
 * Powerup class
 */
export class Powerup {
  constructor(type, position) {
    this.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    this.type = type;
    this.position = position;
    this.collected = false;
    this.spawnedAt = Date.now();
  }

  getState() {
    return {
      id: this.id,
      type: this.type,
      position: this.position,
      collected: this.collected
    };
  }
}

