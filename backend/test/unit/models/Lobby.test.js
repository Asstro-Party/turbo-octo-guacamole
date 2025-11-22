import { describe, it, expect, beforeEach } from 'vitest';
import { Lobby } from '../../../src/models/Lobby.js';

describe('Lobby Model', () => {
  let lobby;

  beforeEach(() => {
    lobby = new Lobby('TEST-123');
  });

  it('should create a lobby with correct properties', () => {
    expect(lobby.lobbyId).toBe('TEST-123');
    expect(lobby.games.size).toBeGreaterThan(0);
    expect(lobby.connections.size).toBe(0);
    expect(lobby.userSockets).toBeDefined();
    expect(lobby.voiceRoom).toBeDefined();
    expect(lobby.defaultGameId).toBe('default');
  });

  it('should create a default game', () => {
    const defaultGame = lobby.getDefaultGame();
    expect(defaultGame).toBeDefined();
    expect(defaultGame.gameId).toBe('default');
    expect(defaultGame.lobbyId).toBe('TEST-123');
  });

  it('should create additional games', () => {
    const game = lobby.createGame('game-2');
    expect(game).toBeDefined();
    expect(lobby.games.has('game-2')).toBe(true);
    expect(game.lobbyId).toBe('TEST-123');
  });

  it('should get game by ID', () => {
    const game = lobby.createGame('test-game');
    const retrieved = lobby.getGame('test-game');
    expect(retrieved).toBe(game);
  });

  it('should delete games', () => {
    lobby.createGame('temp-game');
    expect(lobby.games.has('temp-game')).toBe(true);
    
    lobby.deleteGame('temp-game');
    expect(lobby.games.has('temp-game')).toBe(false);
  });

  it('should add and remove WebSocket connections', () => {
    const mockWs = { readyState: 1 };
    
    lobby.addConnection(mockWs, 1);
    expect(lobby.connections.has(mockWs)).toBe(true);
    expect(lobby.userSockets.has(1)).toBe(true);
    
    lobby.removeConnection(mockWs, 1);
    expect(lobby.connections.has(mockWs)).toBe(false);
    expect(lobby.userSockets.has(1)).toBe(false);
  });

  it('should manage voice room', () => {
    lobby.joinVoice(1);
    expect(lobby.isInVoice(1)).toBe(true);
    expect(lobby.voiceRoom.size).toBe(1);
    expect(lobby.voicePresence.has(1)).toBe(true);
    
    lobby.leaveVoice(1);
    expect(lobby.isInVoice(1)).toBe(false);
    expect(lobby.voiceRoom.size).toBe(0);
    expect(lobby.voicePresence.has(1)).toBe(false);
  });

  it('should get voice members excluding specific user', () => {
    lobby.joinVoice(1);
    lobby.joinVoice(2);
    lobby.joinVoice(3);
    
    const members = lobby.getVoiceMembers(2);
    expect(members).toContain(1);
    expect(members).toContain(3);
    expect(members).not.toContain(2);
    expect(members.length).toBe(2);
  });

  it('should broadcast messages to all connections', () => {
    const mockWs1 = { readyState: 1, send: vi.fn() };
    const mockWs2 = { readyState: 1, send: vi.fn() };
    
    lobby.addConnection(mockWs1, 1);
    lobby.addConnection(mockWs2, 2);
    
    const message = { type: 'test', data: 'hello' };
    lobby.broadcast(message);
    
    expect(mockWs1.send).toHaveBeenCalled();
    expect(mockWs2.send).toHaveBeenCalled();
  });

  it('should send message to specific user', () => {
    const mockWs = { readyState: 1, send: vi.fn() };
    
    lobby.addConnection(mockWs, 1);
    
    const message = { type: 'test', data: 'hello' };
    lobby.sendToUser(1, message);
    
    expect(mockWs.send).toHaveBeenCalled();
  });

  it('should check if lobby is empty', () => {
    expect(lobby.isEmpty()).toBe(true);
    
    const mockWs = { readyState: 1 };
    lobby.addConnection(mockWs, 1);
    expect(lobby.isEmpty()).toBe(false);
    
    lobby.removeConnection(mockWs, 1);
    expect(lobby.isEmpty()).toBe(true);
  });

  it('should get total player count across all games', () => {
    const defaultGame = lobby.getDefaultGame();
    defaultGame.addPlayer(1, 'player1', 0);
    defaultGame.addPlayer(2, 'player2', 1);
    
    expect(lobby.getTotalPlayerCount()).toBe(2);
    
    // Add another game with players
    const game2 = lobby.createGame('game-2');
    game2.addPlayer(3, 'player3', 0);
    
    expect(lobby.getTotalPlayerCount()).toBe(3);
  });

  it('should find available game', () => {
    const availableGame = lobby.findAvailableGame();
    expect(availableGame).toBeDefined();
    expect(availableGame.gameId).toBe('default');
    
    // Fill up the default game
    availableGame.addPlayer(1, 'p1', 0);
    availableGame.addPlayer(2, 'p2', 1);
    availableGame.addPlayer(3, 'p3', 2);
    availableGame.addPlayer(4, 'p4', 3);
    
    // Should return null when full
    const noGame = lobby.findAvailableGame();
    expect(noGame).toBeNull();
  });

  it('should cleanup empty games but keep default', () => {
    const emptyGame = lobby.createGame('empty-game');
    expect(lobby.games.has('empty-game')).toBe(true);
    
    lobby.cleanup();
    
    // Empty non-default game should be removed
    expect(lobby.games.has('empty-game')).toBe(false);
    // Default game should remain
    expect(lobby.games.has('default')).toBe(true);
  });

  it('should broadcast voice messages', () => {
    const mockWs1 = { readyState: 1, send: vi.fn() };
    const mockWs2 = { readyState: 1, send: vi.fn() };
    const mockWs3 = { readyState: 1, send: vi.fn() };
    
    lobby.addConnection(mockWs1, 1);
    lobby.addConnection(mockWs2, 2);
    lobby.addConnection(mockWs3, 3);
    
    lobby.joinVoice(1);
    lobby.joinVoice(2);
    lobby.joinVoice(3);
    
    const message = { type: 'voice', data: 'audio' };
    lobby.broadcastVoice(message, 1); // Exclude user 1
    
    expect(mockWs1.send).not.toHaveBeenCalled();
    expect(mockWs2.send).toHaveBeenCalled();
    expect(mockWs3.send).toHaveBeenCalled();
  });
});