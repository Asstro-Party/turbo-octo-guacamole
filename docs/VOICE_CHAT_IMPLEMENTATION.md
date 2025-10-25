# WebRTC Voice Chat Implementation Guide

This guide explains how to implement peer-to-peer voice chat for your multiplayer game.

## Overview

Voice chat uses **WebRTC** (Web Real-Time Communication) for direct peer-to-peer audio streaming between players. The WebSocket server acts as a signaling server to exchange connection information.

## Architecture

```
Player 1                    WebSocket Server              Player 2
   │                               │                          │
   │──── Offer (SDP) ─────────────>│                          │
   │                               │──── Forward Offer ──────>│
   │                               │<──── Answer (SDP) ───────│
   │<──── Forward Answer ──────────│                          │
   │                               │                          │
   │<════════ Direct P2P Audio Connection ═══════════════════>│
```

## Implementation Steps

### 1. Backend - Add Signaling to WebSocket Server

Update `backend/src/websocket/gameServer.js`:

```javascript
export function setupWebSocketServer(wss) {
  wss.on('connection', (ws) => {
    // ... existing code ...

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          // ... existing cases ...

          case 'webrtc_offer':
            await handleWebRTCOffer(ws, message, currentLobbyId);
            break;

          case 'webrtc_answer':
            await handleWebRTCAnswer(ws, message, currentLobbyId);
            break;

          case 'webrtc_ice_candidate':
            await handleICECandidate(ws, message, currentLobbyId);
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
  });
}

async function handleWebRTCOffer(ws, message, lobbyId) {
  const { targetUserId, offer } = message;

  // Forward offer to target user
  const targetWs = userSockets.get(targetUserId);
  if (targetWs && targetWs.readyState === 1) {
    targetWs.send(JSON.stringify({
      type: 'webrtc_offer',
      fromUserId: message.fromUserId,
      offer: offer
    }));
  }
}

async function handleWebRTCAnswer(ws, message, lobbyId) {
  const { targetUserId, answer } = message;

  const targetWs = userSockets.get(targetUserId);
  if (targetWs && targetWs.readyState === 1) {
    targetWs.send(JSON.stringify({
      type: 'webrtc_answer',
      fromUserId: message.fromUserId,
      answer: answer
    }));
  }
}

async function handleICECandidate(ws, message, lobbyId) {
  const { targetUserId, candidate } = message;

  const targetWs = userSockets.get(targetUserId);
  if (targetWs && targetWs.readyState === 1) {
    targetWs.send(JSON.stringify({
      type: 'webrtc_ice_candidate',
      fromUserId: message.fromUserId,
      candidate: candidate
    }));
  }
}
```

### 2. Frontend - Create VoiceChat Service

Create `frontend/src/services/voiceChat.js`:

```javascript
class VoiceChat {
  constructor(websocket, localUserId) {
    this.ws = websocket;
    this.localUserId = localUserId;
    this.localStream = null;
    this.peerConnections = new Map(); // userId -> RTCPeerConnection
    this.remoteStreams = new Map(); // userId -> MediaStream

    // STUN servers for NAT traversal
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    };

    this.setupWebSocketListeners();
  }

  setupWebSocketListeners() {
    // Handle incoming WebRTC messages
    const originalOnMessage = this.ws.onmessage;

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'webrtc_offer':
          this.handleOffer(message.fromUserId, message.offer);
          break;
        case 'webrtc_answer':
          this.handleAnswer(message.fromUserId, message.answer);
          break;
        case 'webrtc_ice_candidate':
          this.handleICECandidate(message.fromUserId, message.candidate);
          break;
        default:
          // Pass to original handler
          if (originalOnMessage) {
            originalOnMessage(event);
          }
      }
    };
  }

  async startVoiceChat() {
    try {
      // Get microphone access
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('Microphone access granted');
      return true;
    } catch (error) {
      console.error('Failed to access microphone:', error);
      throw error;
    }
  }

  async connectToPeer(remoteUserId) {
    // Create peer connection
    const peerConnection = new RTCPeerConnection(this.iceServers);
    this.peerConnections.set(remoteUserId, peerConnection);

    // Add local audio tracks
    this.localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, this.localStream);
    });

    // Handle incoming remote tracks
    peerConnection.ontrack = (event) => {
      console.log('Received remote track from:', remoteUserId);
      this.remoteStreams.set(remoteUserId, event.streams[0]);
      this.playRemoteAudio(remoteUserId, event.streams[0]);
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'webrtc_ice_candidate',
          fromUserId: this.localUserId,
          targetUserId: remoteUserId,
          candidate: event.candidate
        }));
      }
    };

    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    this.ws.send(JSON.stringify({
      type: 'webrtc_offer',
      fromUserId: this.localUserId,
      targetUserId: remoteUserId,
      offer: offer
    }));
  }

  async handleOffer(remoteUserId, offer) {
    // Create peer connection if doesn't exist
    if (!this.peerConnections.has(remoteUserId)) {
      const peerConnection = new RTCPeerConnection(this.iceServers);
      this.peerConnections.set(remoteUserId, peerConnection);

      // Add local tracks
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream);
      });

      // Handle remote tracks
      peerConnection.ontrack = (event) => {
        this.remoteStreams.set(remoteUserId, event.streams[0]);
        this.playRemoteAudio(remoteUserId, event.streams[0]);
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.ws.send(JSON.stringify({
            type: 'webrtc_ice_candidate',
            fromUserId: this.localUserId,
            targetUserId: remoteUserId,
            candidate: event.candidate
          }));
        }
      };
    }

    const peerConnection = this.peerConnections.get(remoteUserId);

    // Set remote description
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // Create and send answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    this.ws.send(JSON.stringify({
      type: 'webrtc_answer',
      fromUserId: this.localUserId,
      targetUserId: remoteUserId,
      answer: answer
    }));
  }

  async handleAnswer(remoteUserId, answer) {
    const peerConnection = this.peerConnections.get(remoteUserId);
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  async handleICECandidate(remoteUserId, candidate) {
    const peerConnection = this.peerConnections.get(remoteUserId);
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  playRemoteAudio(userId, stream) {
    // Create or get audio element for this user
    let audioElement = document.getElementById(`audio-${userId}`);

    if (!audioElement) {
      audioElement = document.createElement('audio');
      audioElement.id = `audio-${userId}`;
      audioElement.autoplay = true;
      document.body.appendChild(audioElement);
    }

    audioElement.srcObject = stream;
  }

  stopVoiceChat() {
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close all peer connections
    this.peerConnections.forEach((pc, userId) => {
      pc.close();

      // Remove audio element
      const audioElement = document.getElementById(`audio-${userId}`);
      if (audioElement) {
        audioElement.remove();
      }
    });

    this.peerConnections.clear();
    this.remoteStreams.clear();
  }

  muteLocalAudio(muted) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }

  setVolume(userId, volume) {
    const audioElement = document.getElementById(`audio-${userId}`);
    if (audioElement) {
      audioElement.volume = volume; // 0.0 to 1.0
    }
  }
}

export default VoiceChat;
```

### 3. Update Game.jsx to Use Voice Chat

Update `frontend/src/pages/Game.jsx`:

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { leaveLobby } from '../services/api';
import VoiceChat from '../services/voiceChat';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

function Game({ user, token }) {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [players, setPlayers] = useState([]);
  const wsRef = useRef(null);
  const voiceChatRef = useRef(null);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (voiceChatRef.current) {
        voiceChatRef.current.stopVoiceChat();
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

    // Initialize voice chat
    voiceChatRef.current = new VoiceChat(ws, user.id);
  };

  const handleGameMessage = (message) => {
    console.log('Game message:', message);

    switch (message.type) {
      case 'player_joined':
        setPlayers(prev => [...prev, { id: message.userId, username: message.username }]);

        // If voice is enabled, connect to new player
        if (voiceEnabled) {
          voiceChatRef.current.connectToPeer(message.userId);
        }
        break;

      // ... other cases ...
    }
  };

  const toggleVoiceChat = async () => {
    if (!voiceEnabled) {
      try {
        await voiceChatRef.current.startVoiceChat();

        // Connect to all existing players
        players.forEach(player => {
          if (player.id !== user.id) {
            voiceChatRef.current.connectToPeer(player.id);
          }
        });

        setVoiceEnabled(true);
      } catch (err) {
        console.error('Failed to start voice chat:', err);
        alert('Could not access microphone. Please check permissions.');
      }
    } else {
      voiceChatRef.current.stopVoiceChat();
      setVoiceEnabled(false);
    }
  };

  // ... rest of component
}
```

### 4. Production Considerations

#### TURN Server for NAT Traversal

Some users behind strict NATs won't be able to connect P2P. You'll need a TURN server:

**Option 1: Use a Service**
- [Twilio TURN](https://www.twilio.com/stun-turn)
- [Agora.io](https://www.agora.io/)
- [Metered TURN](https://www.metered.ca/tools/openrelay/)

**Option 2: Self-hosted (coturn)**

Install coturn on your server:

```bash
# Ubuntu/Debian
sudo apt-get install coturn

# Configure /etc/turnserver.conf
listening-port=3478
fingerprint
lt-cred-mech
user=username:password
realm=yourdomain.com
```

Update ICE servers in VoiceChat:

```javascript
this.iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'username',
      credential: 'password'
    }
  ]
};
```

#### HTTPS Requirement

WebRTC requires HTTPS in production. Use:
- Let's Encrypt SSL certificates
- Cloudflare SSL
- Your hosting provider's SSL

### 5. Advanced Features

#### Spatial Audio

Make audio volume decrease with distance:

```javascript
updateSpatialAudio(remoteUserId, distance) {
  const maxDistance = 1000;
  const volume = Math.max(0, 1 - (distance / maxDistance));
  this.setVolume(remoteUserId, volume);
}
```

#### Push-to-Talk

Add a key binding for PTT:

```javascript
document.addEventListener('keydown', (e) => {
  if (e.key === 'v' && voiceEnabled) {
    voiceChatRef.current.muteLocalAudio(false);
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'v') {
    voiceChatRef.current.muteLocalAudio(true);
  }
});
```

#### Voice Activity Detection

Automatically mute when not speaking:

```javascript
// In VoiceChat class
setupVAD() {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const microphone = audioContext.createMediaStreamSource(this.localStream);
  microphone.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  const checkVolume = () => {
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

    // Auto-mute if volume below threshold
    const isSpeaking = average > 10;
    this.muteLocalAudio(!isSpeaking);

    requestAnimationFrame(checkVolume);
  };

  checkVolume();
}
```

## Testing

1. **Local Testing:**
   - Open 2-4 browser windows
   - Join the same lobby
   - Enable voice chat in each
   - Speak into microphone

2. **Use Headphones:**
   - Prevent echo/feedback
   - Test with headphones first

3. **Check Console:**
   - Watch for WebRTC connection states
   - Monitor ICE candidate exchange

4. **Network Testing:**
   - Test on different networks
   - Test with VPN
   - Test with mobile hotspot

## Troubleshooting

**No audio heard:**
- Check browser permissions
- Verify `autoplay` is allowed
- Check audio element creation

**Echo/Feedback:**
- Use headphones
- Enable `echoCancellation: true`
- Lower volume

**Connection fails:**
- Check STUN server accessibility
- Add TURN server for production
- Verify firewall allows WebRTC

**High latency:**
- Check network quality
- Use TURN only as fallback
- Optimize audio encoding

## Resources

- [WebRTC Docs](https://webrtc.org/)
- [MDN WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Simple Peer Library](https://github.com/feross/simple-peer) (alternative implementation)

---

Your voice chat should now be fully functional! 🎤
