import React, { useState, useEffect, useRef } from 'react';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
import { useNavigate } from 'react-router-dom';
import { getLobbies, createLobby, joinLobby } from '../services/api';

function Lobby({ user, token, onLogout }) {
  const [lobbies, setLobbies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const wsRef = useRef(null);

  useEffect(() => {
    loadLobbies();
    const interval = setInterval(loadLobbies, 3000); // Fallback polling

    // Connect to WebSocket for lobby updates
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      // No need to join a lobby, just listen for lobby_list_updated
    };
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'lobby_list_updated') {
          loadLobbies();
        }
      } catch (e) {}
    };
    ws.onerror = () => {};
    wsRef.current = ws;

    return () => {
      clearInterval(interval);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const loadLobbies = async () => {
    try {
      const response = await getLobbies();
      setLobbies(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load lobbies');
    } finally {
      setLoading(false);
    }
  };


  const handleCreateLobby = async () => {
    try {
      const response = await createLobby(4);
      navigate(`/waiting/${response.data.lobbyId}`);
    } catch (err) {
      setError('Failed to create lobby');
    }
  };

  const handleJoinLobby = async (lobbyId) => {
    try {
      await joinLobby(lobbyId);
      navigate(`/waiting/${lobbyId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to join lobby');
    }
  };

  return (
    <div className="lobby-page">
      <header>
        <h1>Astro Party</h1>
        <div className="header-actions">
          <button onClick={() => navigate('/profile')}>Profile</button>
          <button onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="lobby-container">
        <div className="welcome">
          <h2>Welcome, {user?.username}!</h2>
          <button className="create-lobby-btn" onClick={handleCreateLobby}>
            Create New Lobby
          </button>
        </div>

        <div className="server-browser">
          <h3>Available Lobbies</h3>
          {error && <div className="error">{error}</div>}

          {loading ? (
            <p>Loading lobbies...</p>
          ) : lobbies.length === 0 ? (
            <p className="no-lobbies">No lobbies available. Create one to start playing!</p>
          ) : (
            <div className="lobby-list">
              {lobbies.map((lobby) => (
                <div key={lobby.lobbyId} className="lobby-card">
                  <div className="lobby-info">
                    <h4>Lobby {lobby.lobbyId.substring(0, 8)}</h4>
                    <p>Players: {lobby.currentPlayers} / {lobby.maxPlayers}</p>
                    <p>Status: {lobby.status}</p>
                  </div>
                  <button
                    onClick={() => handleJoinLobby(lobby.lobbyId)}
                    disabled={lobby.currentPlayers >= lobby.maxPlayers}
                  >
                    {lobby.currentPlayers >= lobby.maxPlayers ? 'Full' : 'Join'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Lobby;
