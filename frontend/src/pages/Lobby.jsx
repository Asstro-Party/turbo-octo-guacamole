import React, { useState, useEffect, useRef } from 'react';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
import { useNavigate } from 'react-router-dom';
import { getLobbies, createLobby, joinLobby } from '../services/api';
import SpaceBackground from '../components/SpaceBackground';

function Lobby({ user, token, onLogout }) {
  const [lobbies, setLobbies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const wsRef = useRef(null);

  useEffect(() => {
    loadLobbies();
    const interval = setInterval(loadLobbies, 3000);

    const ws = new WebSocket(WS_URL);
    ws.onopen = () => {};
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
    <SpaceBackground contentClassName="gap-10 py-14">
      <header className="w-full max-w-6xl rounded-3xl border border-white/10 bg-slate-900/30 px-6 py-6 shadow-glass-lg backdrop-blur-2xl sm:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold uppercase tracking-[0.4em] text-slate-100 drop-shadow">
              Asstro Party
            </h1>
            <p className="mt-2 text-xs uppercase tracking-[0.35em] text-slate-300/80">
              Galactic lobby control center
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate('/profile')}
              className="rounded-2xl border border-white/15 bg-slate-900/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-slate-200 transition hover:border-sky-400/60 hover:text-white"
            >
              Profile
            </button>
            <button
              onClick={onLogout}
              className="rounded-2xl border border-white/15 bg-slate-900/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-slate-200 transition hover:border-rose-400/60 hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="grid w-full max-w-6xl gap-10">
        <section className="rounded-3xl border border-white/10 bg-slate-900/25 p-10 text-center shadow-glass-lg backdrop-blur-2xl">
          <h2 className="text-2xl font-semibold text-slate-100">
            Welcome, {user?.username}!
          </h2>
          <p className="mt-3 text-sm uppercase tracking-[0.32em] text-slate-300/75">
            Select a lobby or launch a new session for your squad
          </p>
          <button
            onClick={handleCreateLobby}
            className="mt-8 inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-500 px-8 py-3 text-xs font-semibold uppercase tracking-[0.4em] text-slate-900 shadow-lg shadow-emerald-400/30 transition hover:-translate-y-0.5 hover:shadow-emerald-400/50"
          >
            Create New Lobby
          </button>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/25 p-10 shadow-glass-lg backdrop-blur-2xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold uppercase tracking-[0.32em] text-slate-200">
              Available Lobbies
            </h3>
            {error && (
              <span className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-rose-200">
                {error}
              </span>
            )}
          </div>

          <div className="mt-8 min-h-[200px]">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm uppercase tracking-[0.3em] text-slate-400">
                Loading lobbies...
              </div>
            ) : lobbies.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-900/40 text-center text-sm uppercase tracking-[0.25em] text-slate-300/70">
                No lobbies available. Create one to start playing!
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {lobbies.map((lobby) => (
                  <div
                    key={lobby.lobbyId}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-left shadow-lg shadow-black/30 transition hover:border-sky-400/40"
                  >
                    <div>
                      <h4 className="text-base font-semibold uppercase tracking-[0.25em] text-slate-100">
                        Lobby {lobby.lobbyId.substring(0, 8)}
                      </h4>
                      <p className="mt-3 text-xs uppercase tracking-[0.28em] text-slate-300/75">
                        Players: {lobby.currentPlayers} / {lobby.maxPlayers}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.28em] text-slate-300/75">
                        Status: {lobby.status}
                      </p>
                    </div>
                    <button
                      onClick={() => handleJoinLobby(lobby.lobbyId)}
                      disabled={lobby.currentPlayers >= lobby.maxPlayers}
                      className="rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 px-6 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-white shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:shadow-indigo-500/50 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:opacity-50 disabled:shadow-none"
                    >
                      {lobby.currentPlayers >= lobby.maxPlayers ? 'Full' : 'Join'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </SpaceBackground>
  );
}

export default Lobby;
