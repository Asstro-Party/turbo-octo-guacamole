import { Game } from './Game.js';

/**
 * Lobby class - Manages multiple games and voice chat
 */
export class Lobby {
  constructor(lobbyId) {
    this.lobbyId = lobbyId;
    this.games = new Map(); // gameId -> Game instance
    this.connections = new Set(); // WebSocket connections for this lobby
    this.userSockets = new Map(); // userId -> Set of ws connections
    this.voiceRoom = new Set(); // Set of userIds in voice chat
    this.voicePresence = new Map(); // userId -> { joinedAt }
    this.defaultGameId = 'default'; // Default game ID for single-game lobbies

    // Create a default game
    this.createGame(this.defaultGameId);
  }

  /**
   * Create a new game in this lobby
   * @param {string} gameId - Game ID
   * @returns {Game} The created game instance
   */
  createGame(gameId) {
    const game = new Game(gameId, this.lobbyId);
    this.games.set(gameId, game);
    console.log(`[Lobby ${this.lobbyId}] Created game ${gameId}`);
    return game;
  }

  /**
   * Get a game by ID
   * @param {string} gameId - Game ID
   * @returns {Game|undefined} Game instance or undefined
   */
  getGame(gameId) {
    return this.games.get(gameId);
  }

  /**
   * Get the default game
   * @returns {Game} Default game instance
   */
  getDefaultGame() {
    return this.games.get(this.defaultGameId);
  }

  /**
   * Delete a game
   * @param {string} gameId - Game ID
   */
  deleteGame(gameId) {
    this.games.delete(gameId);
    console.log(`[Lobby ${this.lobbyId}] Deleted game ${gameId}`);
  }

  /**
   * Add a WebSocket connection to this lobby
   * @param {WebSocket} ws - WebSocket connection
   * @param {number} userId - User ID
   */
  addConnection(ws, userId) {
    this.connections.add(ws);

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(ws);

    console.log(`[Lobby ${this.lobbyId}] User ${userId} connected (${this.userSockets.get(userId).size} socket(s))`);
  }

  /**
   * Remove a WebSocket connection from this lobby
   * @param {WebSocket} ws - WebSocket connection
   * @param {number} userId - User ID
   */
  removeConnection(ws, userId) {
    this.connections.delete(ws);

    if (userId) {
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(ws);
        if (userSocketSet.size === 0) {
          this.userSockets.delete(userId);
        }
      }

      // Remove from all games
      for (const game of this.games.values()) {
        game.removePlayer(userId);
      }
    }

    console.log(`[Lobby ${this.lobbyId}] Connection removed`);
  }

  /**
   * Broadcast a message to all connections in this lobby
   * @param {Object} message - Message to broadcast
   * @param {WebSocket} excludeWs - WebSocket to exclude from broadcast
   */
  broadcast(message, excludeWs = null) {
    console.log(`[Lobby ${this.lobbyId}] Broadcasting ${message.type} to ${this.connections.size} connection(s)`);

    const data = JSON.stringify(message);
    let sentCount = 0;

    this.connections.forEach((client) => {
      if (client !== excludeWs && client.readyState === 1) { // OPEN state
        client.send(data);
        sentCount++;
      }
    });

    console.log(`[Lobby ${this.lobbyId}] Sent ${message.type} to ${sentCount} client(s)`);
  }

  /**
   * Send a message to a specific user
   * @param {number} userId - User ID
   * @param {Object} message - Message to send
   */
  sendToUser(userId, message) {
    console.log(`[Lobby ${this.lobbyId}] Sending ${message.type} to user ${userId}`);

    let sockets = this.userSockets.get(userId);
    if (!sockets) {
      // Try type coercion
      sockets = this.userSockets.get(Number(userId)) || this.userSockets.get(String(userId));
    }

    if (!sockets || sockets.size === 0) {
      console.log(`[Lobby ${this.lobbyId}] WARNING: No sockets found for user ${userId}`);
      return;
    }

    const data = JSON.stringify(message);
    let sentCount = 0;

    sockets.forEach(sock => {
      if (sock.readyState !== 1) return;

      try {
        sock.send(data);
        sentCount++;
      } catch (e) {
        console.error(`[Lobby ${this.lobbyId}] ERROR: Failed to send to user ${userId}:`, e.message);
      }
    });

    console.log(`[Lobby ${this.lobbyId}] Sent ${message.type} to ${sentCount} socket(s) for user ${userId}`);
  }

  // ==================== Voice Chat Methods ====================

  /**
   * Add user to voice room
   * @param {number} userId - User ID
   */
  joinVoice(userId) {
    this.voiceRoom.add(userId);
    this.voicePresence.set(userId, { joinedAt: Date.now() });
    console.log(`[Lobby ${this.lobbyId}] User ${userId} joined voice (${this.voiceRoom.size} member(s))`);
  }

  /**
   * Remove user from voice room
   * @param {number} userId - User ID
   */
  leaveVoice(userId) {
    const hadUser = this.voiceRoom.has(userId);
    this.voiceRoom.delete(userId);
    this.voicePresence.delete(userId);
    console.log(`[Lobby ${this.lobbyId}] User ${userId} ${hadUser ? 'left' : 'was not in'} voice`);
  }

  /**
   * Get voice room members (excluding specific user)
   * @param {number} excludeUserId - User ID to exclude
   * @returns {Array} Array of user IDs
   */
  getVoiceMembers(excludeUserId = null) {
    return Array.from(this.voiceRoom).filter(id => id !== excludeUserId);
  }

  /**
   * Check if user is in voice room
   * @param {number} userId - User ID
   * @returns {boolean} True if user is in voice room
   */
  isInVoice(userId) {
    return this.voiceRoom.has(userId);
  }

  /**
   * Broadcast voice message to all members except sender
   * @param {Object} message - Message to broadcast
   * @param {number} excludeUserId - User ID to exclude
   */
  broadcastVoice(message, excludeUserId = null) {
    for (const userId of this.voiceRoom) {
      if (excludeUserId && userId === excludeUserId) continue;
      this.sendToUser(userId, message);
    }
  }

  /**
   * Clean up stale voice connections
   * @param {number} timeoutMs - Timeout in milliseconds
   */
  cleanupStaleVoice(timeoutMs) {
    const now = Date.now();
    for (const [userId, presence] of this.voicePresence.entries()) {
      if (now - presence.joinedAt > timeoutMs) {
        console.log(`[Lobby ${this.lobbyId}] Cleaning up stale voice connection for user ${userId}`);
        this.leaveVoice(userId);
      }
    }
  }

  // ==================== Game Management Methods ====================

  /**
   * Find an available game for a player to join
   * @returns {Game|null} Available game or null
   */
  findAvailableGame() {
    // For now, just return the default game
    // In the future, this could search for non-full games
    const defaultGame = this.getDefaultGame();
    if (defaultGame && !defaultGame.isFull()) {
      return defaultGame;
    }
    return null;
  }

  /**
   * Get total player count across all games
   * @returns {number} Total player count
   */
  getTotalPlayerCount() {
    let count = 0;
    for (const game of this.games.values()) {
      count += game.getPlayerCount();
    }
    return count;
  }

  /**
   * Check if lobby is empty
   * @returns {boolean} True if lobby has no players and no connections
   */
  isEmpty() {
    return this.connections.size === 0 && this.getTotalPlayerCount() === 0;
  }

  /**
   * Clean up the lobby (remove empty games)
   */
  cleanup() {
    for (const [gameId, game] of this.games) {
      if (game.isEmpty() && gameId !== this.defaultGameId) {
        this.deleteGame(gameId);
      }
    }
  }
}
