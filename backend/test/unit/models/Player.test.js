import { describe, it, expect, beforeEach } from 'vitest';
import { Player } from '../../../src/models/Player.js';

describe('Player Model - Updated API', () => {
  let player;

  beforeEach(() => {
    const spawnPosition = { x: 100, y: 200 };
    player = new Player(1, 'testplayer', spawnPosition, 0);
  });

  it('should create player with correct properties', () => {
    expect(player.userId).toBe(1);
    expect(player.username).toBe('testplayer');
    expect(player.position.x).toBe(100);
    expect(player.position.y).toBe(200);
    expect(player.health).toBe(100);
    expect(player.rotation).toBe(0);
    expect(player.kills).toBe(0);
    expect(player.deaths).toBe(0);
  });

  it('should take damage correctly', () => {
    const died = player.takeDamage(30);
    expect(player.health).toBe(70);
    expect(died).toBe(false);
  });

  it('should die when health reaches zero', () => {
    const died = player.takeDamage(100);
    expect(player.health).toBe(0);
    expect(died).toBe(true);
  });

  it('should not go below zero health', () => {
    player.takeDamage(150);
    expect(player.health).toBe(0);
  });

  it('should update position with wrapping', () => {
    const gameWidth = 1280;
    const gameHeight = 720;
    player.updatePosition(200, 300, gameWidth, gameHeight);
    expect(player.position.x).toBe(200);
    expect(player.position.y).toBe(300);
  });

  it('should wrap position around game boundaries', () => {
    const gameWidth = 1280;
    const gameHeight = 720;
    player.updatePosition(1300, 800, gameWidth, gameHeight);
    expect(player.position.x).toBe(20); // 1300 % 1280
    expect(player.position.y).toBe(80); // 800 % 720
  });

  it('should respawn with full health', () => {
    player.takeDamage(100);
    expect(player.health).toBe(0);
    
    player.respawn({ x: 50, y: 50 });
    expect(player.health).toBe(100);
    expect(player.position.x).toBe(50);
    expect(player.position.y).toBe(50);
  });

  it('should teleport to specific position', () => {
    player.teleport(300, 400);
    expect(player.position.x).toBe(300);
    expect(player.position.y).toBe(400);
  });

  it('should increment kill count', () => {
    expect(player.kills).toBe(0);
    player.addKill();
    expect(player.kills).toBe(1);
    player.addKill();
    expect(player.kills).toBe(2);
  });

  it('should detect state changes', () => {
    const oldX = player.position.x;
    const oldY = player.position.y;
    const oldRot = player.rotation;
    
    expect(player.hasStateChanged(oldX, oldY, oldRot)).toBe(false);
    
    player.position.x = 150;
    expect(player.hasStateChanged(oldX, oldY, oldRot)).toBe(true);
  });

  it('should update from input with rotation', () => {
    const input = { rotation: 1 }; // Turn clockwise
    const dt = 0.1;
    
    const result = player.updateFromInput(input, dt);
    
    expect(result.oldX).toBe(100);
    expect(result.oldY).toBe(200);
    expect(result.oldRot).toBe(0);
    expect(player.rotation).toBeGreaterThan(0);
  });

  it('should normalize rotation to prevent infinity', () => {
    player.rotation = Math.PI * 2.5;
    const input = { rotation: 1 };
    
    player.updateFromInput(input, 0.1);
    
    expect(player.rotation).toBeGreaterThanOrEqual(-Math.PI * 2);
    expect(player.rotation).toBeLessThanOrEqual(Math.PI * 2);
  });

  it('should get player state for broadcasting', () => {
    const state = player.getState();
    
    expect(state.position).toEqual({ x: 100, y: 200 });
    expect(state.rotation).toBe(0);
    expect(state.health).toBe(100);
    expect(state.kills).toBe(0);
    expect(state.deaths).toBe(0);
    expect(state.username).toBe('testplayer');
    expect(state.velocity).toEqual({ x: 0, y: 0 });
    expect(state.speed).toBe(200);
  });

  it('should return fixed spawn positions', () => {
    const positions = Player.getSpawnPositions();
    
    expect(positions).toHaveLength(4);
    expect(positions[0]).toEqual({ x: 180, y: 125 });
    expect(positions[1]).toEqual({ x: 1160, y: 125 });
    expect(positions[2]).toEqual({ x: 1160, y: 625 });
    expect(positions[3]).toEqual({ x: 180, y: 625 });
  });
});