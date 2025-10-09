import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getLobby, leaveLobby } from '../services/api';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

function WaitingRoom({ user }) {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState(null);
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);

  useEffect(() => {
    loadLobby();
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join_game',
        lobbyId,
        userId: user.id,
        username: user.username
      }));
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'player_joined' || message.type === 'player_left') {
        loadLobby();
      }
      if (message.type === 'game_started') {
        navigate(`/game/${lobbyId}`);
      }
    };
    wsRef.current = ws;
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line
  }, [lobbyId]);

  const loadLobby = async () => {
    try {
      const response = await getLobby(lobbyId);
      setLobby(response.data);
      setPlayers(response.data.players || []);
      setIsHost(response.data.hostUserId === user.id);
      setLoading(false);
    } catch (err) {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    await leaveLobby(lobbyId);
    navigate('/lobby');
  };

  const handleStartGame = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'start_game', lobbyId }));
    }
  };

  if (loading) return <div>Loading lobby...</div>;
  if (!lobby) return <div>Lobby not found.</div>;

  return (
    <div className="waiting-room-page">
      <div className="waiting-room-card">
        <h2>Lobby <span className="lobby-id">{lobbyId.substring(0, 8)}</span></h2>
        <div className="players-section">
          <h3>Players <span className="player-count">({players.length}/{lobby.maxPlayers})</span></h3>
          <div className="players-list">
            {players.map((pid) => (
              <div key={pid} className={`player-avatar${pid === lobby.hostUserId ? ' host' : ''}${pid === user.id ? ' you' : ''}`}>
                <div className="avatar-circle">
                  <span role="img" aria-label="avatar">{pid === lobby.hostUserId ? '👑' : '🧑'}</span>
                </div>
                <div className="player-name">{pid === user.id ? 'You' : `Player ${pid.toString().substring(0, 6)}`}</div>
                {pid === lobby.hostUserId && <div className="host-badge">Host</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="waiting-actions">
          {isHost ? (
            <button
              className="start-btn"
              onClick={handleStartGame}
              disabled={players.length < 2 || players.length > 4}
            >
              {players.length < 2 ? 'Need at least 2 players' : 'Start Game'}
            </button>
          ) : (
            <div className="waiting-message">Waiting for host to start the game...</div>
          )}
          <button className="leave-btn" onClick={handleLeave}>Leave Lobby</button>
        </div>
      </div>
    </div>
  );
}

export default WaitingRoom;
