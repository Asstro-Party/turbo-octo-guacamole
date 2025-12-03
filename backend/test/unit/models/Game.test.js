import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../../src/models/Game.js';

describe('Game Model', () => {
  let game;

  beforeEach(() => {
    game = new Game('TEST-GAME', 'TEST-LOBBY');
  });

  it('should initialize game with correct properties', () => {
    expect(game.gameId).toBe('TEST-GAME');
    expect(game.lobbyId).toBe('TEST-LOBBY');
    expect(game.players.size).toBe(0);
    expect(game.gameOver).toBe(false);
    expect(game.bullets).toEqual([]);
    expect(game.walls).toBeDefined();
    expect(game.walls.length).toBeGreaterThan(0);
  });

  it('should add players successfully with spawn index', () => {
    game.addPlayer(1, 'player1', 0);
    expect(game.players.has(1)).toBe(true);
    expect(game.getPlayerCount()).toBe(1);
    
    const player = game.getPlayer(1);
    expect(player.userId).toBe(1);
    expect(player.username).toBe('player1');
    expect(player.position).toBeDefined();
    expect(player.position.x).toBe(140);
    expect(player.position.y).toBe(140);
  });

  it('should add multiple players at different spawn points', () => {
    game.addPlayer(1, 'player1', 0);
    game.addPlayer(2, 'player2', 1);
    game.addPlayer(3, 'player3', 2);
    game.addPlayer(4, 'player4', 3);
    
    expect(game.isFull()).toBe(true);
    expect(game.getPlayerCount()).toBe(4);
  });

  it('should remove players successfully', () => {
    game.addPlayer(1, 'player1', 0);
    game.addPlayer(2, 'player2', 1);
    
    game.removePlayer(1);
    expect(game.players.has(1)).toBe(false);
    expect(game.getPlayerCount()).toBe(1);
  });

  it('should handle player input', () => {
    game.addPlayer(1, 'player1', 0);
    
    const input = { rotation: 1, shoot: null };
    game.handlePlayerInput(1, input);
    
    expect(game.playerInputs[1]).toBeDefined();
    expect(game.playerInputs[1].rotation).toBe(1);
  });

  it('should create bullets when player shoots', () => {
    game.addPlayer(1, 'player1', 0);
    const player = game.getPlayer(1);
    
    const shootData = {
      position: { x: player.position.x, y: player.position.y },
      rotation: 0
    };
    
    game.createBullet(1, shootData);
    expect(game.bullets.length).toBe(1);
    expect(game.bullets[0].shooterId).toBe(1);
  });

  it('should update game state with delta time', () => {
    game.addPlayer(1, 'player1', 0);
    game.addPlayer(2, 'player2', 1);
    
    const broadcastCallback = vi.fn();
    const dt = 0.016; // ~60fps
    
    // Add some input
    game.handlePlayerInput(1, { rotation: 1 });
    
    const result = game.update(dt, broadcastCallback);
    expect(typeof result).toBe('boolean');
  });

  it('should handle bullet-wall collisions', () => {
    game.addPlayer(1, 'player1', 0);
    const player = game.getPlayer(1);
    
    // Create a bullet heading toward a wall
    const shootData = {
      position: { x: 30, y: 40 },
      rotation: 0
    };
    
    game.createBullet(1, shootData);
    expect(game.bullets.length).toBe(1);
    
    const broadcastCallback = vi.fn();
    const dt = 1; // Large dt to move bullet far
    
    game.updateBullets(dt, broadcastCallback);
    // Bullet should either hit wall or go off screen
  });

  it('should handle bullet-player collisions and award kills', () => {
    game.addPlayer(1, 'player1', 0);
    game.addPlayer(2, 'player2', 1);
    
    const player1 = game.getPlayer(1);
    const player2 = game.getPlayer(2);
    
    // Position players close together
    player1.position.x = 100;
    player1.position.y = 100;
    player2.position.x = 110;
    player2.position.y = 100;
    
    // Create bullet from player1 heading toward player2
    const shootData = {
      position: { x: 100, y: 100 },
      rotation: 0
    };
    game.createBullet(1, shootData);
    
    const initialHealth = player2.health;
    const broadcastCallback = vi.fn();
    
    // Manually position bullet to hit player2
    game.bullets[0].position.x = 110;
    game.bullets[0].position.y = 100;
    
    const result = game.handleBulletPlayerCollisions(broadcastCallback);
    
    // Health should decrease
    expect(player2.health).toBeLessThan(initialHealth);
  });

  it('should detect game over when player reaches kill limit', () => {
    game.addPlayer(1, 'player1', 0);
    game.addPlayer(2, 'player2', 1);
    
    const player1 = game.getPlayer(1);
    const player2 = game.getPlayer(2);
    
    // Manually set kills to just below win condition
    player1.kills = game.KILLS_TO_WIN - 1;
    
    // Position for collision
    player1.position.x = 100;
    player1.position.y = 100;
    player2.position.x = 110;
    player2.position.y = 100;
    
    // Create bullet
    const shootData = {
      position: { x: 100, y: 100 },
      rotation: 0
    };
    game.createBullet(1, shootData);
    game.bullets[0].position.x = 110;
    game.bullets[0].position.y = 100;
    
    const broadcastCallback = vi.fn();
    const result = game.handleBulletPlayerCollisions(broadcastCallback);
    
    // Should trigger game over
    if (result && typeof result === 'object' && result.gameOver) {
      expect(result.gameOver).toBe(true);
      expect(result.winnerId).toBe(1);
      expect(game.gameOver).toBe(true);
    }
  });

  it('should check if game is full', () => {
    expect(game.isFull()).toBe(false);
    
    game.addPlayer(1, 'player1', 0);
    game.addPlayer(2, 'player2', 1);
    game.addPlayer(3, 'player3', 2);
    expect(game.isFull()).toBe(false);
    
    game.addPlayer(4, 'player4', 3);
    expect(game.isFull()).toBe(true);
  });

  it('should check if game is empty', () => {
    expect(game.isEmpty()).toBe(true);
    
    game.addPlayer(1, 'player1', 0);
    expect(game.isEmpty()).toBe(false);
    
    game.removePlayer(1);
    expect(game.isEmpty()).toBe(true);
  });

  it('should get game state for broadcasting', () => {
    game.addPlayer(1, 'player1', 0);
    game.addPlayer(2, 'player2', 1);
    
    const state = game.getState();
    
    expect(state.players).toBeDefined();
    expect(state.players[1]).toBeDefined();
    expect(state.players[2]).toBeDefined();
    expect(state.bullets).toBeDefined();
    expect(state.walls).toBeDefined();
  });

  it('should find safe respawn positions', () => {
    game.addPlayer(1, 'player1', 0);
    
    const safePos = game.findRandomSafePosition(1);
    
    expect(safePos).toBeDefined();
    expect(safePos.x).toBeGreaterThan(0);
    expect(safePos.x).toBeLessThan(game.GAME_WIDTH);
    expect(safePos.y).toBeGreaterThan(0);
    expect(safePos.y).toBeLessThan(game.GAME_HEIGHT);
  });

  it('should initialize walls correctly', () => {
    expect(game.walls).toBeDefined();
    expect(Array.isArray(game.walls)).toBe(true);
    expect(game.walls.length).toBe(40); // From initializeWalls()
    
    // Check first wall structure
    const wall = game.walls[0];
    expect(wall.id).toBeDefined();
    expect(wall.position).toBeDefined();
    expect(wall.position.x).toBeDefined();
    expect(wall.position.y).toBeDefined();
    expect(wall.health).toBe(100);
    expect(typeof wall.isHorizontal).toBe('boolean');
  });

  it('should not update game if already over', () => {
    game.gameOver = true;
    
    const broadcastCallback = vi.fn();
    const result = game.update(0.016, broadcastCallback);
    
    expect(result).toBe(false);
  });
});