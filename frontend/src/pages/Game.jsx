import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getLobby, leaveLobby } from '../services/api';
import SpaceBackground from '../components/SpaceBackground';
import VoiceChat from '../services/voiceChat';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

function Game({ user, token }) {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [selfMuted, setSelfMuted] = useState(false);
  const [lobbyMuted, setLobbyMuted] = useState(false);
  const [players, setPlayers] = useState([]);
  const [playerModels, setPlayerModels] = useState({});
  const [localModel, setLocalModel] = useState('');
  const [loadingLobby, setLoadingLobby] = useState(true);
  const wsRef = useRef(null);
  const voiceChatRef = useRef(null);

  useEffect(() => {
    loadLobby();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      // Don't leave lobby on unmount - only when explicitly clicking "Leave Game"
      // handleLeaveGame();
    };
  }, [lobbyId]);

  const loadLobby = async () => {
    try {
      const response = await getLobby(lobbyId);
      const models = response.data.playerModels || {};
      setPlayerModels(models);
      const key = String(user.id);
      setLocalModel(models[key] || '');
    } catch (err) {
      console.error('Failed to load lobby:', err);
    } finally {
      setLoadingLobby(false);
    }
  };

  const connectWebSocket = () => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        type: 'join_game',
        lobbyId,
        userId: user.id,
        username: user.username
      }));
      // Ask backend for ICE servers for this lobby
      ws.send(JSON.stringify({ type: 'get_ice_servers', lobbyId }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleGameMessage(message);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      setConnected(false);
    };

    wsRef.current = ws;
  };

  const handleGameMessage = (message) => {
    switch (message.type) {
      case 'ice_servers': {
        if (!voiceChatRef.current) {
          voiceChatRef.current = new VoiceChat(wsRef.current, user.id);
        }
        voiceChatRef.current.setICEServers(message.config);
        break;
      }
      case 'joined': {
        // Track players for voice chat purposes
        const list = message.players || [];
        setPlayers(list);
        break;
      }
      case 'player_model_state': {
        const models = message.playerModels || {};
        setPlayerModels(models);
        const key = String(user.id);
        if (models[key]) {
          setLocalModel(models[key]);
        }
        sendToGodot(message);
        break;
      }
      case 'player_joined': {
        setPlayers((prev) => {
          const next = Array.from(new Set([...(prev || []), message.userId]));
          // connect to new peer if voice already enabled
          if (voiceEnabled && voiceChatRef.current && message.userId !== user.id) {
            voiceChatRef.current.connectToPeer(message.userId);
          }
          return next;
        });
        sendToGodot(message);
        break;
      }
      case 'player_model_selected': {
        if (message.playerModels) {
          setPlayerModels(message.playerModels);
          const next = message.playerModels[String(user.id)];
          if (next) {
            setLocalModel(next);
          }
        } else {
          setPlayerModels((prev) => {
            const updated = { ...prev };
            updated[String(message.userId)] = message.model;
            return updated;
          });
          if (message.userId === user.id) {
            setLocalModel(message.model);
          }
        }
        sendToGodot(message);
        break;
      }
      case 'player_left': {
        setPlayerModels((prev) => {
          const updated = { ...prev };
          delete updated[String(message.userId)];
          return updated;
        });
        setPlayers((prev) => prev.filter((pid) => pid !== message.userId));
        sendToGodot(message);
        break;
      }
      case 'game_started':
      case 'game_state':
      case 'player_action':
      case 'kill':
      case 'game_ended':
      case 'game_over':
        sendToGodot(message);
        if (message.type === 'game_ended') {
          setTimeout(() => navigate('/lobby'), 3000);
        }
        break;
      case 'return_to_waiting':
        navigate(`/waiting/${lobbyId}`);
        break;
      default:
        break;
    }
  };

  const sendToGodot = (message) => {
    const iframe = document.getElementById('godot-game');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(message, '*');
    }
  };

  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      lobbyId,
      userId: user.id,
      username: user.username
    });
    if (localModel) {
      params.append('playerModel', localModel);
    }
    return `/godot-game/index.html?${params.toString()}`;
  }, [lobbyId, user.id, user.username, localModel]);

  const handleLeaveGame = async () => {
    try {
      await leaveLobby(lobbyId);
    } catch (err) {
      console.error('Failed to leave lobby:', err);
    }
  };

  const toggleVoiceChat = async () => {
    if (!voiceEnabled) {
      try {
        if (!voiceChatRef.current) {
          voiceChatRef.current = new VoiceChat(wsRef.current, user.id);
        }
        await voiceChatRef.current.startVoiceChat();
        const expected = (players || []).filter((pid) => pid !== user.id);
        voiceChatRef.current.setExpectedPeers(expected);
        for (const pid of expected) {
          await voiceChatRef.current.connectToPeer(pid);
        }
        setVoiceEnabled(true);
      } catch (err) {
        console.error('Failed to start voice chat:', err);
        alert('Could not access microphone');
      }
    } else {
      voiceChatRef.current?.stopVoiceChat();
      setSelfMuted(false);
      setLobbyMuted(false);
      setVoiceEnabled(false);
    }
  };

  const toggleSelfMute = () => {
    const next = !selfMuted;
    setSelfMuted(next);
    voiceChatRef.current?.muteLocalAudio(next);
  };

  const toggleLobbyMute = () => {
    const next = !lobbyMuted;
    setLobbyMuted(next);
    voiceChatRef.current?.muteLobbyAudio(next);
  };

  const handleLeaveLobby = async () => {
    await handleLeaveGame();
    navigate('/lobby');
  };

  return (
    <SpaceBackground contentClassName="gap-10 py-14">
      <header className="w-full max-w-6xl rounded-3xl border border-white/10 bg-slate-900/30 px-6 py-6 shadow-glass-lg backdrop-blur-2xl sm:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm uppercase tracking-[0.35em] text-slate-300/80">Lobby</h3>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold uppercase tracking-[0.3em] text-slate-100">
                {lobbyId.substring(0, 8)}
              </span>
              <span className={`text-xs uppercase tracking-[0.35em] ${connected ? 'text-emerald-300' : 'text-rose-300'}`}>
                {connected ? '● Connected' : '○ Disconnected'}
              </span>
            </div>
          </div>
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto">
            <button
              className={`shrink-0 whitespace-nowrap rounded-2xl border border-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] transition ${voiceEnabled ? 'border-emerald-300/60 bg-emerald-300/10 text-emerald-200' : 'bg-slate-900/40 text-slate-200 hover:border-sky-400/60 hover:text-white'}`}
              onClick={toggleVoiceChat}
            >
              {voiceEnabled ? 'Voice On' : 'Enable Voice'}
            </button>
            <button
              disabled={!voiceEnabled}
              className={`shrink-0 whitespace-nowrap rounded-2xl border border-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] transition ${lobbyMuted ? 'border-amber-300/60 bg-amber-300/10 text-amber-200' : 'bg-slate-900/40 text-slate-200 hover:border-sky-400/60 hover:text-white'}`}
              onClick={toggleLobbyMute}
            >
              {lobbyMuted ? 'Lobby Muted' : 'Mute Lobby'}
            </button>
            <button
              disabled={!voiceEnabled}
              className={`shrink-0 whitespace-nowrap rounded-2xl border border-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] transition ${selfMuted ? 'border-rose-300/60 bg-rose-300/10 text-rose-200' : 'bg-slate-900/40 text-slate-200 hover:border-sky-400/60 hover:text-white'}`}
              onClick={toggleSelfMute}
            >
              {selfMuted ? 'Self Muted' : 'Mute Self'}
            </button>
            <button
              onClick={handleLeaveLobby}
              className="shrink-0 whitespace-nowrap rounded-2xl border border-rose-400/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-rose-200 transition hover:border-rose-300 hover:text-rose-100"
            >
              Leave Game
            </button>
          </div>
        </div>
      </header>
      


      <div className="game-container">
        {/* Godot game will be embedded here */}
        {!loadingLobby && (
          <iframe
            id="godot-game"
            src={iframeSrc}
            title="Astro Party Game"
            className="godot-iframe"
            allow="autoplay; microphone"
          />
        )}
      </div>

      <div className="w-full max-w-6xl rounded-3xl border border-white/10 bg-slate-900/25 px-6 py-4 text-center text-xs uppercase tracking-[0.3em] text-slate-300/75 shadow-glass-lg backdrop-blur-2xl">
        <p>
          <strong className="font-semibold text-slate-100">Controls:</strong> Q to turn, SPACEBAR or click to shoot
        </p>
      </div>
    </SpaceBackground>
  );
}

export default Game;
