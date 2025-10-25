class VoiceChat {
  constructor(websocket, localUserId) {
    this.ws = websocket;
    this.localUserId = localUserId;
    this.localStream = null;
    this.peerConnections = new Map(); // userId -> RTCPeerConnection
    this.remoteStreams = new Map(); // userId -> MediaStream
    this.remoteStates = new Map(); // userId -> { connectionState, iceConnectionState }
    this.expectedPeers = new Set();
    this.iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    this.onAllConnected = null; // optional callback
    this.peerMeta = new Map(); // userId -> { makingOffer: boolean, polite: boolean }

    this._installWsListener();
  }

  setExpectedPeers(userIds) {
    this.expectedPeers = new Set(userIds.filter((id) => id !== this.localUserId));
  }

  setICEServers(config) {
    if (config && config.iceServers) {
      this.iceConfig = { iceTransportPolicy: 'all', ...config };
      try {
        const safe = {
          iceServers: (config.iceServers || []).map((s) => ({ urls: s.urls, hasAuth: !!s.username })),
          iceTransportPolicy: this.iceConfig.iceTransportPolicy
        };
        console.log('[VoiceChat] ICE config', safe);
      } catch {}
    }
  }

  async startVoiceChat() {
    console.log('[VoiceChat] Requesting microphone access...');
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    console.log('[VoiceChat] Microphone access granted. Tracks:', this.localStream.getTracks().map(t => t.kind));
    return true;
  }

  async connectToPeer(remoteUserId) {
    if (remoteUserId === this.localUserId) return;
    if (this.peerConnections.has(remoteUserId)) return;

    console.log('[VoiceChat] Creating RTCPeerConnection to', remoteUserId, 'with config', this.iceConfig);
    const pc = new RTCPeerConnection(this.iceConfig || { iceServers: [] });
    this.peerConnections.set(remoteUserId, pc);
    const polite = String(this.localUserId) < String(remoteUserId);
    this.peerMeta.set(remoteUserId, { makingOffer: false, polite });

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
        console.log('[VoiceChat]', remoteUserId, 'added local track', track.kind);
      });
    } else {
      try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch {}
    }

    pc.ontrack = (event) => {
      console.log('[VoiceChat]', remoteUserId, 'ontrack received. streams:', event.streams.length);
      this.remoteStreams.set(remoteUserId, event.streams[0]);
      this._attachRemoteAudio(remoteUserId, event.streams[0]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.debug('[VoiceChat]', remoteUserId, 'onicecandidate', event.candidate.candidate);
        this.ws.send(JSON.stringify({
          type: 'webrtc_ice_candidate',
          fromUserId: this.localUserId,
          targetUserId: remoteUserId,
          candidate: event.candidate
        }));
      }
    };
    pc.onicecandidateerror = (e) => console.warn('[VoiceChat]', remoteUserId, 'onicecandidateerror', e);
    pc.onicegatheringstatechange = () => console.log('[VoiceChat]', remoteUserId, 'iceGatheringState', pc.iceGatheringState);
    pc.onsignalingstatechange = () => console.log('[VoiceChat]', remoteUserId, 'signalingState', pc.signalingState);
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[VoiceChat]', remoteUserId, 'connectionState', state);
      this._markPeerState(remoteUserId, { connectionState: state, iceConnectionState: pc.iceConnectionState });
      if (this._allPeersConnected()) {
        if (typeof this.onAllConnected === 'function') this.onAllConnected();
      }
    };
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log('[VoiceChat]', remoteUserId, 'iceConnectionState', state);
      this._markPeerState(remoteUserId, { connectionState: pc.connectionState, iceConnectionState: state });
      if (state === 'failed') {
        try {
          console.warn('[VoiceChat]', remoteUserId, 'ICE failed. Attempting restart...');
          pc.restartIce?.();
        } catch (e) {
          console.warn('[VoiceChat]', remoteUserId, 'ICE restart not available', e);
        }
      }
    };
    pc.onnegotiationneeded = () => console.log('[VoiceChat]', remoteUserId, 'onnegotiationneeded');

    let offer;
    try {
      this.peerMeta.get(remoteUserId).makingOffer = true;
      offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
    } finally {
      this.peerMeta.get(remoteUserId).makingOffer = false;
    }
    console.log('[VoiceChat]', remoteUserId, 'localDescription set. Sending offer');
    this.ws.send(JSON.stringify({
      type: 'webrtc_offer',
      fromUserId: this.localUserId,
      targetUserId: remoteUserId,
      offer
    }));
  }

  async handleOffer(fromUserId, offer) {
    let pc = this.peerConnections.get(fromUserId);
    if (!pc) {
      pc = new RTCPeerConnection(this.iceConfig || { iceServers: [] });
      this.peerConnections.set(fromUserId, pc);
      const polite = String(this.localUserId) < String(fromUserId);
      this.peerMeta.set(fromUserId, { makingOffer: false, polite });

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          pc.addTrack(track, this.localStream);
          console.log('[VoiceChat]', fromUserId, 'added local track', track.kind);
        });
      } else {
        try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch {}
      }

      pc.ontrack = (event) => {
        this.remoteStreams.set(fromUserId, event.streams[0]);
        this._attachRemoteAudio(fromUserId, event.streams[0]);
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.ws.send(JSON.stringify({
            type: 'webrtc_ice_candidate',
            fromUserId: this.localUserId,
            targetUserId: fromUserId,
            candidate: event.candidate
          }));
        }
      };
      pc.onconnectionstatechange = () => {
        this.remoteStates.set(fromUserId, pc.connectionState);
        if (this._allPeersConnected()) {
          if (typeof this.onAllConnected === 'function') this.onAllConnected();
        }
      };
    }

    console.log('[VoiceChat]', fromUserId, 'received offer. signalingState=', pc.signalingState);
    const meta = this.peerMeta.get(fromUserId) || { makingOffer: false, polite: true };
    const offerDesc = new RTCSessionDescription(offer);
    const isStable = pc.signalingState === 'stable' || (pc.signalingState === 'have-local-offer' && offerDesc.type === 'offer' && pc.currentRemoteDescription);
    const isCollision = meta.makingOffer || !isStable;
    if (isCollision) {
      if (!meta.polite) {
        console.warn('[VoiceChat]', fromUserId, 'glare detected (not polite). Ignoring offer');
        return;
      }
      console.log('[VoiceChat]', fromUserId, 'glare detected (polite). Rolling back');
      await pc.setLocalDescription({ type: 'rollback' });
    }
    await pc.setRemoteDescription(offerDesc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log('[VoiceChat]', fromUserId, 'localDescription set. Sending answer');
    this.ws.send(JSON.stringify({
      type: 'webrtc_answer',
      fromUserId: this.localUserId,
      targetUserId: fromUserId,
      answer
    }));
  }

  async handleAnswer(fromUserId, answer) {
    const pc = this.peerConnections.get(fromUserId);
    if (pc) {
      console.log('[VoiceChat]', fromUserId, 'applying remote answer');
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } else {
      console.warn('[VoiceChat] handleAnswer: missing pc for', fromUserId);
    }
  }

  async handleICECandidate(fromUserId, candidate) {
    const pc = this.peerConnections.get(fromUserId);
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.debug('[VoiceChat]', fromUserId, 'added ICE candidate');
      } catch (e) {
        console.warn('[VoiceChat] addIceCandidate error for', fromUserId, e);
      }
    } else {
      console.warn('[VoiceChat] handleICECandidate: missing pc for', fromUserId);
    }
  }

  stopVoiceChat() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.peerConnections.forEach((pc, userId) => {
      try { pc.close(); } catch {}
      const el = document.getElementById(`audio-${userId}`);
      if (el) el.remove();
    });
    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.remoteStates.clear();
    this.expectedPeers.clear();
  }

  muteLocalAudio(muted) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach((track) => (track.enabled = !muted));
  }

  muteLobbyAudio(muted) {
    this.remoteStreams.forEach((_, userId) => {
      const el = document.getElementById(`audio-${userId}`);
      if (el) el.muted = !!muted;
    });
  }

  _installWsListener() {
    const original = this.ws.onmessage;
    this.ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { msg = {}; }
      if (msg && msg.type && (String(msg.type).startsWith('webrtc') || String(msg.type).startsWith('voice') || msg.type === 'ice_servers')) {
        console.log('[VoiceChat] WS message', msg.type, msg);
      }
      switch (msg.type) {
        case 'webrtc_offer':
          this.handleOffer(msg.fromUserId, msg.offer);
          break;
        case 'webrtc_answer':
          this.handleAnswer(msg.fromUserId, msg.answer);
          break;
        case 'webrtc_ice_candidate':
          this.handleICECandidate(msg.fromUserId, msg.candidate);
          break;
        default:
          if (typeof original === 'function') original(event);
      }
    };
  }

  _attachRemoteAudio(userId, stream) {
    let el = document.getElementById(`audio-${userId}`);
    if (!el) {
      el = document.createElement('audio');
      el.id = `audio-${userId}`;
      el.autoplay = true;
      el.playsInline = true;
      document.body.appendChild(el);
    }
    el.srcObject = stream;
    el.muted = false;
    el.volume = 1.0;
    el.play?.().catch((e) => console.warn('[VoiceChat] autoplay/play blocked for user', userId, e?.message || e));
  }

  _allPeersConnected() {
    if (this.expectedPeers.size === 0) return false;
    for (const uid of this.expectedPeers) {
      const state = this.remoteStates.get(uid) || {};
      const okConn = state.connectionState === 'connected' || state.connectionState === 'completed';
      const okIce = state.iceConnectionState === 'connected' || state.iceConnectionState === 'completed';
      if (!(okConn || okIce)) return false;
    }
    return true;
  }

  _markPeerState(userId, next) {
    const prev = this.remoteStates.get(userId) || {};
    this.remoteStates.set(userId, { ...prev, ...next });
  }
}

export default VoiceChat;
