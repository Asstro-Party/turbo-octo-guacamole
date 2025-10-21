import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getLobby, leaveLobby, selectPlayerModel } from '../services/api';
import SpaceBackground from '../components/SpaceBackground';

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
      if (message.type === 'player_model_state') {
        setPlayerModels(message.playerModels || {});
        if (message.userId === user?.id) {
          setSelectionError('');
        }
      }
      if (message.type === 'return_to_waiting') {
        // Refresh lobby data when returning from game
        loadLobby();
        if (message.playerModels) {
          setPlayerModels(message.playerModels);
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
    if (selectingModel || !userKey) return;

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
        setPlayerModels((prev) => ({ ...prev, [userKey]: modelId }));
      }
    } catch (err) {
      setSelectionError(err.response?.data?.error || 'Failed to select model.');
      loadLobby();
    } finally {
      setSelectingModel(false);
    }
  };

  if (loading)
    return (
      <SpaceBackground>
        <div className="text-sm uppercase tracking-[0.3em] text-slate-300/70">Loading lobby...</div>
      </SpaceBackground>
    );
  if (!lobby)
    return (
      <SpaceBackground>
        <div className="text-sm uppercase tracking-[0.3em] text-slate-300/70">Lobby not found.</div>
      </SpaceBackground>
    );

  return (
    <SpaceBackground contentClassName="py-14">
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-900/25 p-10 shadow-glass-lg backdrop-blur-2xl">
        <div className="text-center">
          <h2 className="text-2xl font-semibold uppercase tracking-[0.35em] text-slate-100">
            Lobby <span className="rounded-xl bg-slate-900/60 px-3 py-1 text-xs font-normal uppercase tracking-[0.4em] text-slate-300/80">{lobbyId.substring(0, 8)}</span>
          </h2>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-300/75">
            Pick your pilot, then wait for the launch signal.
          </p>
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-300/70">
            <span>Players ({players.length}/{lobby.maxPlayers})</span>
            {selectionError && (
              <span className="rounded-xl border border-rose-400/50 bg-rose-500/10 px-3 py-1 text-[0.65rem] text-rose-200">
                {selectionError}
              </span>
            )}
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-4">
            {players.map((pid) => {
              const isYou = pid === user.id;
              const isHostPlayer = pid === lobby.hostUserId;
              const model = playerModels[String(pid)];
              return (
                <div
                  key={pid}
                  className={`flex w-40 flex-col items-center rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-5 text-center shadow-lg shadow-black/30 transition ${isYou ? 'border-emerald-400/60 shadow-emerald-400/20' : ''} ${isHostPlayer ? 'border-amber-300/70 shadow-amber-300/20' : ''}`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/60 text-xl">
                    {isHostPlayer ? '👑' : '🧑'}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-100">
                    {isYou ? 'You' : `Player ${pid.toString().substring(0, 6)}`}
                  </p>
                  {model ? (
                    <img
                      src={`/players/${model}`}
                      alt={`Selected model ${model}`}
                      className="mt-4 h-12 w-12 rounded-xl shadow-md shadow-black/40"
                    />
                  ) : (
                    <span className="mt-4 flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-white/20 text-[0.55rem] uppercase tracking-[0.25em] text-slate-400">
                      No model
                    </span>
                  )}
                  {isHostPlayer && (
                    <span className="mt-3 rounded-full border border-amber-300/50 bg-amber-200/10 px-3 py-1 text-[0.55rem] uppercase tracking-[0.35em] text-amber-200">
                      Host
                    </span>
                  )}
                  {isYou && (
                    <span className="mt-2 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-[0.55rem] uppercase tracking-[0.35em] text-emerald-200">
                      You
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-10">
          <h3 className="text-center text-xs uppercase tracking-[0.35em] text-slate-300/70">
            Choose Your Pilot
          </h3>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {PLAYER_MODELS.map(({ id, label }) => {
              const takenByOther = Object.entries(playerModels || {}).some(
                ([pid, selected]) => selected === id && pid !== userKey
              );
              const isSelected = (playerModels || {})[userKey] === id;
              return (
                <button
                  key={id}
                  onClick={() => handleSelectModel(id)}
                  disabled={takenByOther || selectingModel || !userKey}
                  className={`flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-4 text-left transition hover:border-sky-400/50 ${isSelected ? 'border-emerald-400/60 shadow-lg shadow-emerald-400/20' : ''} ${takenByOther ? 'opacity-50' : ''}`}
                >
                  <img src={`/players/${id}`} alt={label} className="h-16 w-16 rounded-xl shadow-md shadow-black/40" />
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-100">{label}</p>
                    <p className="mt-1 text-[0.6rem] uppercase tracking-[0.35em] text-slate-400">
                      {takenByOther ? 'Taken' : isSelected ? 'Locked in' : 'Available'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {isHost ? (
            <button
              className="rounded-2xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-500 px-6 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-slate-900 shadow-lg shadow-emerald-400/30 transition hover:-translate-y-0.5 hover:shadow-emerald-400/45 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              onClick={handleStartGame}
              disabled={players.length < 2 || players.length > 4 || players.some(pid => !playerModels[String(pid)])}
            >
              {players.length < 2
                ? 'Need at least 2 players'
                : players.some(pid => !playerModels[String(pid)])
                  ? 'All players must choose a model'
                  : 'Start Game'}
            </button>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-3 text-center text-[0.65rem] uppercase tracking-[0.35em] text-slate-300/70">
              Waiting for host to start the game...
            </div>
          )}
          <button
            className="rounded-2xl border border-rose-400/50 bg-rose-500/10 px-6 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-rose-200 transition hover:border-rose-300 hover:text-rose-100"
            onClick={handleLeave}
          >
            Leave Lobby
          </button>
        </div>
      </div>
    </SpaceBackground>
  );
}

export default WaitingRoom;
