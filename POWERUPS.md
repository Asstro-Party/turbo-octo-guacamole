# Powerup System Documentation

## Overview
The game now includes 3 unique powerups that spawn randomly on the map every 15 seconds. Players can pick them up and use them by pressing the **E key**.

## Powerups

### 1. Diarrhea Laser 💩⚡
- **Type**: Offensive weapon
- **Duration**: 5 seconds
- **Range**: 400 units
- **Damage**: 10 damage per tick (every 100ms)
- **Description**: Fires a continuous brown/orange laser beam that damages all enemies in its path
- **Usage**: Single-use, activates immediately when pressed

### 2. Plunger Melee 🪠
- **Type**: Melee weapon + Speed boost
- **Damage**: 100 damage (instant kill!)
- **Range**: 80 units
- **Knockback**: 200 units
- **Duration**: 10 seconds 
- **Speed Boost**: 2x movement speed for entire duration
- **Description**: A one-hit-kill melee weapon that also doubles your movement speed
- **Usage**: Single use attack, but speed boost lasts 10 seconds

### 3. Diaper Mines 🧷💥
- **Type**: Trap/Area denial
- **Charges**: 3 mines
- **Damage**: 50 damage per mine
- **Arm Time**: 1 second after placement
- **Trigger Radius**: 50 units
- **Lifetime**: 30 seconds
- **Description**: Place up to 3 mines on the ground that explode when enemies walk near them
- **Usage**: Press E to place one mine at your current location (3 total uses)

## How to Use

1. **Pick Up**: Walk over a powerup that spawns on the map (yellow/gold visual)
   - ⚠️ **You can only hold ONE powerup at a time!**
   - If you already have a powerup, you cannot pick up another
   - Pickup is **automatic** when you walk near a powerup
2. **Activate**: Press the **E key** to use your powerup
3. **Visual Indicators**: 
   - **UI Display**: Your current powerup appears in the UI with "[E]" prompt
   - **Player Color**: Your character changes color based on the powerup you're holding:
     - 🟢 **Green** = Diarrhea Laser
     - 🔴 **Red** = Diaper Mines
     - 🟡 **Yellow** = Plunger Melee
   - **Color automatically resets to white** when powerup expires or is fully consumed
4. **Strategic Use**: 
   - Laser: Aim at enemies for maximum damage
   - Plunger: Get close to enemies and swing repeatedly
   - Mines: Place them in chokepoints or near objectives

## Spawn Locations

### First Powerup:
- **Always spawns at CENTER** of the map (640, 360) - inside the center box
- Spawns immediately when game starts

### Subsequent Powerups:
- Spawn 5 seconds after previous powerup is picked up
- Spawn randomly at one of 4 locations:
  - Top center (640, 100)
  - Bottom center (640, 620)
  - Left center (100, 360)
  - Right center (1180, 360)

## Technical Details

### Backend Files Created/Modified:
- `backend/src/models/Powerup.js` - New file with powerup types and logic
- `backend/src/models/Player.js` - Added powerup inventory tracking
- `backend/src/models/Game.js` - Added powerup spawning, pickup, and usage logic
- `backend/src/websocket/gameServer.js` - Added message handlers for powerups

### Godot Files Created/Modified:
- `godot-game/scripts/PowerupManager.gd` - New file managing powerup visuals
- `godot-game/scripts/GameManager.gd` - Integrated powerup system
- `godot-game/scripts/NetworkManager.gd` - Added powerup signals and handlers
- `godot-game/scripts/Player.gd` - Added E key input for powerup usage

## Server-Client Communication

### Messages from Server:
- `powerup_spawned` - New powerup appears on map
- `powerup_collected` - Player picked up powerup
- `laser_activated` - Laser beam activated
- `laser_deactivated` - Laser beam ended
- `plunger_used` - Plunger swing animation
- `mine_placed` - Mine placed on ground
- `mine_armed` - Mine is now active
- `mine_triggered` - Mine exploded
- `mine_expired` - Mine timed out

### Messages to Server:
- `pickup_powerup` - Request to pick up powerup
- `use_powerup` - Activate current powerup

## Future Enhancements

### Visual Assets Needed:
- [ ] Diarrhea laser beam texture
- [ ] Plunger model/sprite
- [ ] Diaper mine sprite
- [ ] Explosion effects
- [ ] Powerup pickup particle effects

### Potential Additional Powerups:
- Speed boost
- Shield/invincibility
- Triple shot
- Homing bullets
- Teleport ability

## Testing

To test the powerup system:
1. Start the backend server: `cd backend && npm start`
2. Start the frontend: `cd frontend && npm run dev`
3. Create/join a lobby with at least 2 players
4. Wait for powerups to spawn (every 15 seconds)
5. Pick up powerups and press E to use them
6. Verify each powerup works as expected

## Notes
- Only one powerup spawns on the map at a time
- **Players can only hold ONE powerup at a time** (enforced server-side)
- Cannot pick up a new powerup while holding one
- Powerups persist through respawns unless fully consumed
- Server validates all powerup usage to prevent cheating
- Current powerup is displayed in the UI with remaining charges

## Assets (Visual)

The system currently uses **procedurally generated visuals** (colored shapes) that work without any PNG files. This allows immediate testing.

### Current Visuals:
- **Powerups**: Yellow/gold squares (32x32)
- **Laser**: Orange/brown line with pulsing effect
- **Plunger**: Red square (40x40)
- **Mines**: Brown circles (24x24), turn red when armed
- **Explosions**: Particle effects

### Recommended Future Assets:
For a polished game, create these PNG files:
- `powerup_laser.png` - Diarrhea laser icon
- `powerup_plunger.png` - Plunger icon  
- `powerup_diaper.png` - Diaper mines icon
- `plunger_weapon.png` - Plunger sprite
- `mine_sprite.png` - Diaper mine sprite
- Custom particle textures for explosions

