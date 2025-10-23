import SimplePeer from 'simple-peer/simplepeer.min.js';

class VoiceChat {
  constructor(websocket, localUserId) {
    this.ws = websocket;
    this.localUserId = localUserId;
    this.localStream = null;
    this.peers = new Map(); // userId -> SimplePeer instance

    // STUN servers for NAT traversal
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    };

    this.setupWebSocketListeners();
  }

  setupWebSocketListeners() {
    // Handle incoming WebRTC signaling messages
    const originalOnMessage = this.ws.onmessage;

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'webrtc_signal':
          this.handleSignal(message.fromUserId, message.signal);
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

  connectToPeer(remoteUserId) {
    if (this.peers.has(remoteUserId)) {
      console.log('Already connected to peer:', remoteUserId);
      return;
    }

    console.log('Initiating connection to peer:', remoteUserId);

    // Create peer as initiator
    const peer = new SimplePeer({
      initiator: true,
      stream: this.localStream,
      config: this.config,
      trickle: true
    });

    this.setupPeerListeners(peer, remoteUserId);
    this.peers.set(remoteUserId, peer);
  }

  handleSignal(remoteUserId, signal) {
    let peer = this.peers.get(remoteUserId);

    if (!peer) {
      console.log('Received signal from new peer:', remoteUserId);
      // Create peer as non-initiator
      peer = new SimplePeer({
        initiator: false,
        stream: this.localStream,
        config: this.config,
        trickle: true
      });

      this.setupPeerListeners(peer, remoteUserId);
      this.peers.set(remoteUserId, peer);
    }

    // Signal the peer
    peer.signal(signal);
  }

  setupPeerListeners(peer, remoteUserId) {
    // Handle signaling data
    peer.on('signal', (signal) => {
      console.log('Sending signal to:', remoteUserId);
      this.ws.send(JSON.stringify({
        type: 'webrtc_signal',
        fromUserId: this.localUserId,
        targetUserId: remoteUserId,
        signal: signal
      }));
    });

    // Handle incoming stream
    peer.on('stream', (stream) => {
      console.log('Received stream from:', remoteUserId);
      this.playRemoteAudio(remoteUserId, stream);
    });

    // Handle connection
    peer.on('connect', () => {
      console.log('Connected to peer:', remoteUserId);
    });

    // Handle errors
    peer.on('error', (err) => {
      console.error('Peer error with', remoteUserId, ':', err);
    });

    // Handle close
    peer.on('close', () => {
      console.log('Peer connection closed:', remoteUserId);
      this.peers.delete(remoteUserId);
      
      // Remove audio element
      const audioElement = document.getElementById(`audio-${remoteUserId}`);
      if (audioElement) {
        audioElement.remove();
      }
    });
  }

  playRemoteAudio(userId, stream) {
    // Create or get audio element for this user
    let audioElement = document.getElementById(`audio-${userId}`);
    console.log('Playing audio for user:', userId);
    
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

    // Destroy all peer connections
    this.peers.forEach((peer, userId) => {
      peer.destroy();

      // Remove audio element
      const audioElement = document.getElementById(`audio-${userId}`);
      if (audioElement) {
        audioElement.remove();
      }
    });

    this.peers.clear();
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