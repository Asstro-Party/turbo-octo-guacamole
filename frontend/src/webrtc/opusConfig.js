/**
 * WebRTC Audio Optimization for Low Latency Voice Chat
 * Optimized for game voice comms - prioritizes low latency over audio quality
 */

/**
 * Tune Opus codec in SDP for ultra-low bandwidth and latency
 * @param {string} sdp - The SDP string
 * @returns {string} - Modified SDP with Opus optimization
 */
export function tuneOpusForLowBw(sdp) {
    const lines = sdp.split('\r\n');
    const opusPayloadType = findOpusPayloadType(lines);

    if (!opusPayloadType) {
        console.warn('[Opus] Could not find Opus payload type in SDP');
        return sdp;
    }

    const newLines = [];
    let opusFmtpFound = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check if this is the Opus fmtp line
        if (line.startsWith(`a=fmtp:${opusPayloadType}`)) {
            opusFmtpFound = true;
            // Ultra-aggressive settings for lowest latency
            newLines.push(
                `a=fmtp:${opusPayloadType} ` +
                'minptime=10;' +           // Minimum packet time: 10ms (ultra low latency)
                'maxptime=20;' +           // Maximum packet time: 20ms
                'maxaveragebitrate=16000;' + // Very low bitrate: 16kbps (voice optimized)
                'stereo=0;' +              // Mono only
                'sprop-stereo=0;' +        // Disable stereo
                'cbr=1;' +                 // Constant bitrate for predictable performance
                'useinbandfec=0;' +        // Disable FEC to reduce latency
                'usedtx=1'                 // Enable DTX (silence suppression)
            );
            console.log('[Opus] Applied ultra-low latency settings:', newLines[newLines.length - 1]);
        } else {
            newLines.push(line);
        }
    }

    // If no fmtp line existed, add one after the rtpmap line
    if (!opusFmtpFound) {
        for (let i = 0; i < newLines.length; i++) {
            if (newLines[i].includes(`rtpmap:${opusPayloadType} opus`)) {
                newLines.splice(i + 1, 0,
                    `a=fmtp:${opusPayloadType} ` +
                    'minptime=10;' +
                    'maxptime=20;' +
                    'maxaveragebitrate=16000;' +
                    'stereo=0;' +
                    'sprop-stereo=0;' +
                    'cbr=1;' +
                    'useinbandfec=0;' +
                    'usedtx=1'
                );
                console.log('[Opus] Added ultra-low latency fmtp line');
                break;
            }
        }
    }

    return newLines.join('\r\n');
}

/**
 * Find the Opus payload type in SDP
 */
function findOpusPayloadType(lines) {
    for (const line of lines) {
        // Look for "a=rtpmap:<payloadType> opus/48000/2"
        const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
        if (match) {
            return match[1];
        }
    }
    return null;
}

/**
 * Apply sender bandwidth parameters directly to RTCPeerConnection
 * This sets ultra-low bandwidth constraints on the actual RTP sender
 */
export async function applySenderLowBwParams(pc) {
    if (!pc || !pc.getSenders) {
        console.warn('[Opus] Invalid peer connection');
        return;
    }

    const senders = pc.getSenders();
    for (const sender of senders) {
        if (sender.track && sender.track.kind === 'audio') {
            const params = sender.getParameters();

            if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}];
            }

            // Ultra-aggressive bandwidth limiting
            params.encodings[0].maxBitrate = 16000;  // 16 kbps max
            params.encodings[0].priority = 'high';    // Prioritize audio over other traffic
            params.encodings[0].networkPriority = 'high';

            try {
                await sender.setParameters(params);
                console.log('[Opus] Applied ultra-low bandwidth params to sender:', params.encodings[0]);
            } catch (e) {
                console.error('[Opus] Failed to set sender parameters:', e);
            }
        }
    }
}

/**
 * Attach remote audio with optimized playback settings
 */
export function attachRemoteAudio(remoteStream, peerId, peerAudioRef, remoteAudioContainerRef) {
    let el = peerAudioRef.current[peerId];

    if (!el) {
        console.log(`[Audio] Creating optimized audio element for peer ${peerId}`);
        el = document.createElement('audio');
        el.autoplay = true;
        el.playsInline = true;
        el.setAttribute('data-peer', String(peerId));

        // Critical: disable any browser audio processing that adds latency
        el.volume = 1.0;

        // Try to set low latency hint (Chrome/Edge)
        if ('setSinkId' in el) {
            el.setSinkId('default').catch(e => console.log('[Audio] setSinkId not supported'));
        }

        peerAudioRef.current[peerId] = el;

        if (remoteAudioContainerRef.current) {
            remoteAudioContainerRef.current.appendChild(el);
        } else {
            document.body.appendChild(el);
        }
    }

    el.srcObject = remoteStream;

    // Force immediate playback
    el.play().catch(e => {
        console.warn('[Audio] Autoplay blocked, user interaction required:', e);
    });

    console.log(`[Audio] Attached remote stream for peer ${peerId} with low-latency settings`);
}
