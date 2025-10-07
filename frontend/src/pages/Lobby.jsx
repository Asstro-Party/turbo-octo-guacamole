import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLobbies, createLobby, joinLobby } from '../services/api';

function Lobby({ user, token, onLogout }) {
  const [lobbies, setLobbies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadLobbies();
    const interval = setInterval(loadLobbies, 3000); // Refresh every 3 seconds
    return () => clearInterval(interval);
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
      navigate(`/game/${response.data.lobbyId}`);
    } catch (err) {
      setError('Failed to create lobby');
    }
  };

  const handleJoinLobby = async (lobbyId) => {
    try {
      await joinLobby(lobbyId);
      navigate(`/game/${lobbyId}`);
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
