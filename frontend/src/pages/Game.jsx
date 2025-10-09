import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { leaveLobby } from '../services/api';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

function Game({ user, token }) {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const wsRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);

  useEffect(() => {
    // Connect to game WebSocket
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      handleLeaveGame();
    };
  }, [lobbyId]);

  const connectWebSocket = () => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('Connected to game server');
      setConnected(true);

      // Join the game
      ws.send(JSON.stringify({
        type: 'join_game',
        lobbyId,
        userId: user.id,
        username: user.username
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleGameMessage(message);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Disconnected from game server');
      setConnected(false);
    };

    wsRef.current = ws;
  };

  const handleGameMessage = (message) => {
    console.log('Game message:', message);

    switch (message.type) {
      case 'joined':
        console.log('Successfully joined game');
        break;
      case 'player_joined':
        console.log(`Player ${message.username} joined`);
        break;
      case 'game_started':
        console.log('Game started!');
        break;
      case 'game_state':
        // Update Godot game state
        sendToGodot(message);
        break;
      case 'player_action':
        sendToGodot(message);
        break;
      case 'kill':
        console.log(`Player ${message.killerId} killed ${message.victimId}`);
        sendToGodot(message);
        break;
      case 'game_ended':
        console.log('Game ended!', message.results);
        setTimeout(() => navigate('/lobby'), 3000);
        break;
    }
  };

  const sendToGodot = (message) => {
    // Send message to Godot game via postMessage
    const iframe = document.getElementById('godot-game');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(message, '*');
    }
  };

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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        setVoiceEnabled(true);
        // TODO: Set up WebRTC peer connections
      } catch (err) {
        console.error('Failed to access microphone:', err);
        alert('Could not access microphone');
      }
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      setVoiceEnabled(false);
    }
  };

  const handleLeaveLobby = async () => {
    await handleLeaveGame();
    navigate('/lobby');
  };

  return (
    <div className="game-page">
      <div className="game-header">
        <div className="game-info">
          <h3>Lobby: {lobbyId.substring(0, 8)}</h3>
          <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>
        <div className="game-controls">
          <button
            className={`voice-btn ${voiceEnabled ? 'active' : ''}`}
            onClick={toggleVoiceChat}
          >
            {voiceEnabled ? '🎤 Voice On' : '🎤 Voice Off'}
          </button>
          <button onClick={handleLeaveLobby}>Leave Game</button>
        </div>
      </div>


      <div className="game-container">
        {/* Godot game will be embedded here */}
        <iframe
          id="godot-game"
          src={`/godot-game/index.html?lobbyId=${encodeURIComponent(lobbyId)}&userId=${encodeURIComponent(user.id)}&username=${encodeURIComponent(user.username)}`}
          title="Astro Party Game"
          className="godot-iframe"
          allow="autoplay; microphone"
        />
      </div>

      <div className="game-instructions">
        <p><strong>Controls:</strong> WASD to move, Mouse to aim, Click to shoot</p>
      </div>
    </div>
  );
}

export default Game;
