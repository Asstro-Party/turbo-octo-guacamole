import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getLobby, leaveLobby } from '../services/api';
import SpaceBackground from '../components/SpaceBackground';
import SimplePeer from 'simple-peer';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

function Game({ user, token }) {
  const { lobbyId } = useParams();
  const navigate = useNavigate();

  const [connected, setConnected] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [playerModels, setPlayerModels] = useState({});
  const [localModel, setLocalModel] = useState('');
  const [loadingLobby, setLoadingLobby] = useState(true);

  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({}); // peerId -> SimplePeer instance
  const peerAudioRef = useRef({}); // peerId -> HTMLAudioElement
  const iceServersRef = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const remoteAudioContainerRef = useRef(null);

  useEffect(() => {
    loadLobby();
    connectWebSocket();

    return () => {
      cleanupVoice();
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      console.log('[WebRTC Client] WebSocket connected');
      console.log('[WebRTC Client] This is the REACT WebSocket for user:', user.id);
      setConnected(true);
      ws.send(
        JSON.stringify({
          type: 'join_game',
          lobbyId,
          userId: user.id,
          username: user.username,
        })
      );

      // If user already toggled voice before socket reconnect, rejoin voice
      if (voiceEnabled) {
        console.log('[WebRTC Client] Reconnecting to voice room after WebSocket reconnect');
        ws.send(
          JSON.stringify({ type: 'joined_voice', roomId: lobbyId, userId: user.id })
        );
      }
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      // Log ALL voice-related messages with high visibility
      if (message.type && message.type.startsWith('voice_')) {
        console.log('🎤 [WebRTC Client] VOICE MESSAGE RECEIVED:', message.type, message);
      } else {
        console.log('[WebRTC Client] Received message:', message.type);
      }
      
      if (!handleVoiceMessage(message)) {
        handleGameMessage(message);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[WebRTC Client] WebSocket disconnected');
      setConnected(false);
    };

    wsRef.current = ws;
  };

  // ------------------ GAME MESSAGES ------------------
  const handleGameMessage = (message) => {
    switch (message.type) {
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
      case 'player_model_selected': {
        if (message.playerModels) {
          setPlayerModels(message.playerModels);
          const next = message.playerModels[String(user.id)];
          if (next) setLocalModel(next);
        } else {
          setPlayerModels((prev) => {
            const updated = { ...prev };
            updated[String(message.userId)] = message.model;
            return updated;
          });
          if (message.userId === user.id) setLocalModel(message.model);
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
        sendToGodot(message);
        break;
      }
      case 'joined':
      case 'player_joined':
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
      username: user.username,
    });
    if (localModel) params.append('playerModel', localModel);
    return `/godot-game/index.html?${params.toString()}`;
  }, [lobbyId, user.id, user.username, localModel]);

  // ------------------ VOICE: simple-peer ------------------
  const handleVoiceMessage = (msg) => {
    console.log('[WebRTC Client] handleVoiceMessage checking type:', msg.type);
    
    switch (msg.type) {
      case 'voice_peer_list': {
        console.log('[WebRTC Client] Received voice_peer_list:', msg);
        console.log('[WebRTC Client] Current user:', user.id);
        console.log('[WebRTC Client] Peers in list:', msg.peers);
        
        if (Array.isArray(msg.iceServers)) {
          iceServersRef.current = msg.iceServers;
          console.log('[WebRTC Client] Updated ICE servers:', JSON.stringify(msg.iceServers));
        }
        
        // Create peers for existing members
        msg.peers.forEach((p) => {
          console.log(`[WebRTC Client] Creating peer for ${p.userId} (initiator: ${p.initiatorHint})`);
          ensurePeer(p.userId, p.initiatorHint);
        });
        return true;
      }
      case 'voice_peer_joined': {
        console.log('[WebRTC Client] Peer joined:', msg.userId);
        const hint = initiatorHintFor(user.id, msg.userId);
        console.log(`[WebRTC Client] Initiator hint for ${msg.userId}: ${hint}`);
        ensurePeer(msg.userId, hint);
        return true;
      }
      case 'voice_peer_left': {
        console.log('[WebRTC Client] Peer left:', msg.userId);
        destroyPeer(msg.userId);
        return true;
      }
      case 'voice_signal': {
        const { fromUserId, data } = msg;
        console.log(`[WebRTC Client] Signal from ${fromUserId}:`, data?.type || 'unknown');
        
        const peer = peersRef.current[fromUserId] || ensurePeer(fromUserId, false);
        if (peer) {
          try { 
            peer.signal(data);
            console.log(`[WebRTC Client] Successfully signaled peer ${fromUserId}`);
          } catch (e) { 
            console.error(`[WebRTC Client] Signal error for peer ${fromUserId}:`, e);
          }
        } else {
          console.warn(`[WebRTC Client] No peer found for ${fromUserId}`);
        }
        return true;
      }
      default:
        console.log('[WebRTC Client] Not a voice message, passing to game handler');
        return false;
    }
  };

  const initiatorHintFor = (selfId, otherId) => {
    const a = Number(selfId);
    const b = Number(otherId);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return a < b;
    return String(selfId) < String(otherId);
  };

  const ensurePeer = (peerId, initiator) => {
    console.log(`[WebRTC Client] ensurePeer called for ${peerId}, initiator: ${initiator}`);
    
    if (String(peerId) === String(user.id)) {
      console.log('[WebRTC Client] Skipping self peer');
      return null; // don't peer with self
    }
    
    if (peersRef.current[peerId]) {
      console.log(`[WebRTC Client] Peer ${peerId} already exists`);
      return peersRef.current[peerId];
    }
    
    if (!localStreamRef.current) {
      console.warn('[WebRTC Client] No local stream available yet');
      return null; // no mic yet
    }

    console.log(`[WebRTC Client] Creating new SimplePeer for ${peerId}`);
    console.log(`[WebRTC Client] ICE servers:`, iceServersRef.current);
    
    const peer = new SimplePeer({
      initiator,
      trickle: true,
      stream: localStreamRef.current,
      config: { iceServers: iceServersRef.current },
    });

    console.log(`[WebRTC Client] SimplePeer created for ${peerId}:`, peer);

    // outbound signals -> server
    peer.on('signal', (data) => {
      console.log(`[WebRTC Client] Sending signal to ${peerId}:`, data.type);
      wsSend({
        type: 'voice_signal',
        roomId: lobbyId,
        fromUserId: user.id,
        toUserId: peerId,
        data,
      });
    });

    // when remote stream arrives, attach to an audio element
    peer.on('stream', (remoteStream) => {
      console.log(`[WebRTC Client] Received remote stream from ${peerId}`);
      console.log(`[WebRTC Client] Stream tracks:`, remoteStream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled })));
      
      let el = peerAudioRef.current[peerId];
      if (!el) {
        console.log(`[WebRTC Client] Creating audio element for ${peerId}`);
        el = document.createElement('audio');
        el.autoplay = true;
        el.playsInline = true;
        el.setAttribute('data-peer', String(peerId));
        peerAudioRef.current[peerId] = el;
        if (remoteAudioContainerRef.current) {
          remoteAudioContainerRef.current.appendChild(el);
        } else {
          // fallback: append to body
          document.body.appendChild(el);
        }
      }
      el.srcObject = remoteStream;
      console.log(`[WebRTC Client] Audio element attached for ${peerId}`);
    });

    peer.on('connect', () => {
      console.log(`[WebRTC Client] ✅ Peer connection established with ${peerId}`);
    });

    peer.on('close', () => {
      console.log(`[WebRTC Client] Peer connection closed with ${peerId}`);
      destroyPeer(peerId);
    });
    
    peer.on('error', (err) => {
      console.error(`[WebRTC Client] ❌ Peer error with ${peerId}:`, err);
    });

    peersRef.current[peerId] = peer;
    console.log(`[WebRTC Client] Active peers:`, Object.keys(peersRef.current));
    return peer;
  };

  const destroyPeer = (peerId) => {
    console.log(`[WebRTC Client] Destroying peer ${peerId}`);
    
    const p = peersRef.current[peerId];
    if (p) {
      try { 
        p.destroy();
        console.log(`[WebRTC Client] Peer ${peerId} destroyed`);
      } catch (e) {
        console.error(`[WebRTC Client] Error destroying peer ${peerId}:`, e);
      }
      delete peersRef.current[peerId];
    } else {
      console.log(`[WebRTC Client] Peer ${peerId} not found in peersRef`);
    }
    
    const el = peerAudioRef.current[peerId];
    if (el) {
      try {
        el.srcObject = null;
        el.remove();
        console.log(`[WebRTC Client] Audio element removed for ${peerId}`);
      } catch (e) {
        console.error(`[WebRTC Client] Error removing audio element for ${peerId}:`, e);
      }
      delete peerAudioRef.current[peerId];
    }
    
    console.log(`[WebRTC Client] Remaining peers:`, Object.keys(peersRef.current));
  };

  const cleanupVoice = () => {
    console.log('[WebRTC Client] Cleaning up voice connections');
    console.log('[WebRTC Client] Active peers before cleanup:', Object.keys(peersRef.current));
    
    Object.keys(peersRef.current).forEach((id) => destroyPeer(id));
    
    if (localStreamRef.current) {
      console.log('[WebRTC Client] Stopping local stream tracks');
      localStreamRef.current.getTracks().forEach((t) => {
        console.log(`[WebRTC Client] Stopping track: ${t.kind}`);
        t.stop();
      });
      localStreamRef.current = null;
    }
    
    setVoiceEnabled(false);
    console.log('[WebRTC Client] Voice cleanup complete');
  };

  const wsSend = (obj) => {
    const ws = wsRef.current;
    if (!ws) {
      console.warn('[WebRTC Client] Cannot send - WebSocket not initialized');
      return;
    }
    if (ws.readyState !== 1) {
      console.warn(`[WebRTC Client] Cannot send - WebSocket not open (state: ${ws.readyState})`);
      return;
    }
    
    // Only log non-signal messages or first few signals to avoid spam
    if (obj.type !== 'voice_signal' || Math.random() < 0.1) {
      console.log('[WebRTC Client] Sending to server:', obj.type, obj.type === 'voice_signal' ? `(to: ${obj.toUserId})` : '');
    }
    
    ws.send(JSON.stringify(obj));
  };

  const toggleVoiceChat = async () => {
    if (!voiceEnabled) {
      console.log('[WebRTC Client] Enabling voice chat');
      try {
        console.log('[WebRTC Client] Requesting microphone access');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[WebRTC Client] Microphone access granted');
        console.log('[WebRTC Client] Stream tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled })));
        
        localStreamRef.current = stream;
        setVoiceEnabled(true);
        
        // announce join to server to receive peer list + ICE
        console.log('[WebRTC Client] Sending joined_voice to server');
        wsSend({ type: 'joined_voice', roomId: lobbyId, userId: user.id });
      } catch (err) {
        console.error('[WebRTC Client] Failed to access microphone:', err);
        alert('Could not access microphone');
      }
    } else {
      // leaving voice: inform server and teardown
      console.log('[WebRTC Client] Disabling voice chat');
      wsSend({ type: 'leave_voice', roomId: lobbyId, userId: user.id });
      cleanupVoice();
    }
  };

  const handleLeaveGame = async () => {
    console.log('[WebRTC Client] Leaving game');
    try {
      wsSend({ type: 'leave_voice', roomId: lobbyId, userId: user.id });
      cleanupVoice();
      await leaveLobby(lobbyId);
    } catch (err) {
      console.error('Failed to leave lobby:', err);
    }
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
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={`rounded-2xl border border-white/15 px-5 py-3 text-xs font-semibold uppercase tracking-[0.32em] transition ${voiceEnabled ? 'border-emerald-300/60 bg-emerald-300/10 text-emerald-200' : 'bg-slate-900/40 text-slate-200 hover:border-sky-400/60 hover:text-white'}`}
              onClick={toggleVoiceChat}
            >
              {voiceEnabled ? 'Voice On' : 'Voice Off'}
            </button>
            <button
              onClick={handleLeaveLobby}
              className="rounded-2xl border border-rose-400/60 bg-rose-500/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-rose-200 transition hover:border-rose-300 hover:text-rose-100"
            >
              Leave Game
            </button>
          </div>
        </div>
      </header>

      <div className="game-container">
        {/* hidden container for remote audio elements */}
        <div ref={remoteAudioContainerRef} className="hidden" />

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
