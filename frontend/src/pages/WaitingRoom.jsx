import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getLobby, leaveLobby, selectPlayerModel } from '../services/api';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const PLAYER_MODELS = [
  { id: 'player1.png', label: 'Pilot 1' },
  { id: 'player2.png', label: 'Pilot 2' },
  { id: 'player3.png', label: 'Pilot 3' },
  { id: 'player4.png', label: 'Pilot 4' }
];

function WaitingRoom({ user }) {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState(null);
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playerModels, setPlayerModels] = useState({});
  const [selectionError, setSelectionError] = useState('');
  const [selectingModel, setSelectingModel] = useState(false);
  const wsRef = useRef(null);
  const userKey = user ? String(user.id) : '';

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
      if (message.type === 'player_model_selected') {
        setPlayerModels(message.playerModels || {});
        if (message.userId === user?.id) {
          setSelectionError('');
        }
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
      setPlayerModels(response.data.playerModels || {});
      setIsHost(response.data.hostUserId === user.id);
      setSelectionError('');
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

  const handleSelectModel = async (modelId) => {
    if (selectingModel) return;

    const takenByOther = Object.entries(playerModels || {}).some(
      ([pid, selected]) => selected === modelId && pid !== userKey
    );
    if (takenByOther) {
      setSelectionError('That model is already taken.');
      return;
    }
    if ((playerModels || {})[userKey] === modelId) {
      setSelectionError('');
      return;
    }

    try {
      setSelectingModel(true);
      setSelectionError('');
      const response = await selectPlayerModel(lobbyId, modelId);
      if (response.data?.playerModels) {
        setPlayerModels(response.data.playerModels);
      } else {
        setPlayerModels(prev => ({ ...prev, [userKey]: modelId }));
      }
    } catch (err) {
      setSelectionError(err.response?.data?.error || 'Failed to select model.');
      loadLobby();
    } finally {
      setSelectingModel(false);
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
                <div className="player-model-preview">
                  {playerModels && playerModels[String(pid)] ? (
                    <img
                      src={`/players/${playerModels[String(pid)]}`}
                      alt={`Selected model ${playerModels[String(pid)]}`}
                      style={{ width: 48, height: 48 }}
                    />
                  ) : (
                    <span
                      className="model-placeholder"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 48,
                        height: 48,
                        background: '#1f1f1f',
                        color: '#bbb',
                        borderRadius: 8,
                        fontSize: 12
                      }}
                    >
                      No model
                    </span>
                  )}
                </div>
                {pid === lobby.hostUserId && <div className="host-badge">Host</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="model-selection">
          <h3>Choose Your Pilot</h3>
          {selectionError && <div className="error">{selectionError}</div>}
          <div className="model-grid">
            {PLAYER_MODELS.map(({ id, label }) => {
              const takenByOther = Object.entries(playerModels || {}).some(
                ([pid, selected]) => selected === id && pid !== userKey
              );
              const isSelected = (playerModels || {})[userKey] === id;
              return (
                <button
                  key={id}
                  className={`model-option${isSelected ? ' selected' : ''}`}
                  onClick={() => handleSelectModel(id)}
                  disabled={takenByOther || selectingModel || !userKey}
                >
                  <img src={`/players/${id}`} alt={label} style={{ width: 64, height: 64 }} />
                  <span>{takenByOther ? 'Taken' : label}</span>
                </button>
              );
            })}
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
