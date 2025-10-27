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