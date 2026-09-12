import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';

export function useWebRTC(roomId, socket) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});

  useEffect(() => {
    if (!roomId || !socket) return;

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        localStreamRef.current = stream;
        setIsVoiceConnected(true);

        socket.emit('join-voice', { roomId });

        socket.on('user-joined-voice', ({ signal, callerId }) => {
          const peer = new Peer({ initiator: false, trickle: false, stream });
          peer.on('signal', (signalData) => {
            socket.emit('return-voice-signal', { signal: signalData, callerId });
          });
          peer.signal(signal);
          peersRef.current[callerId] = peer;
        });
      })
      .catch((err) => console.warn('Microphone permission denied or unsupported:', err));

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      Object.values(peersRef.current).forEach((peer) => peer.destroy());
    };
  }, [roomId, socket]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  return { isMuted, isVoiceConnected, toggleMute };
}