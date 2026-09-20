import { useCallback, useEffect, useRef, useState } from "react";
import Peer from "simple-peer";

function getPeerId(payload) {
  return payload?.peerId || payload?.callerId || payload?.userId || payload?.from;
}

export function useWebRTC(
  roomId,
  socket,
  enabled = true,
  isHost = false,
  roomReady = false,
  hasAudioApproval = false
) {
  const [isMuted, setIsMuted] = useState(true);
  const [canSpeak, setCanSpeak] = useState(isHost);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [retryToken, setRetryToken] = useState(0);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());

  const removePeer = useCallback((peerId) => {
    const peer = peersRef.current.get(peerId);

    if (peer) {
      peer.destroy();
      peersRef.current.delete(peerId);
    }

    setRemoteStreams((streams) => streams.filter((stream) => stream.peerId !== peerId));
  }, []);

  const createPeer = useCallback(
    (peerId, stream, initiator) => {
      if (!peerId || peersRef.current.has(peerId)) return;

      const peer = new Peer({
        initiator,
        trickle: false,
        stream,
        config: {
          iceServers: [
            {
              urls: import.meta.env.VITE_STUN_URL || "stun:stun.l.google.com:19302",
            },
          ],
        },
        objectMode: false,
      });

      peer.on("signal", (signal) => {
        socket.emit("voice-signal", {
          roomId,
          to: peerId,
          callerId: socket.id,
          signal,
        });
      });

      peer.on("stream", (remoteStream) => {
        setRemoteStreams((streams) => {
          const withoutPeer = streams.filter((item) => item.peerId !== peerId);
          return [...withoutPeer, { peerId, stream: remoteStream }];
        });
      });

      peer.on("close", () => removePeer(peerId));
      peer.on("error", () => removePeer(peerId));
      peersRef.current.set(peerId, peer);
    },
    [removePeer, roomId, socket]
  );

  useEffect(() => {
    if (!roomId || !socket || !enabled || !roomReady) return undefined;

    let disposed = false;
    let activeStream = null;
    const activePeers = peersRef.current;

    const handleVoiceUsers = ({ users = [] } = {}) => {
      const stream = localStreamRef.current;
      if (!stream || disposed) return;

      users
        .map((user) => (typeof user === "string" ? user : getPeerId(user)))
        .filter((peerId) => peerId && peerId !== socket.id)
        .forEach((peerId) => createPeer(peerId, stream, true));
    };

    const handleSignal = ({ from, callerId, peerId, signal } = {}) => {
      const senderId = from || callerId || peerId;
      if (!senderId || !signal || senderId === socket.id) return;

      const peer = peersRef.current.get(senderId);
      if (peer) {
        peer.signal(signal);
        return;
      }

      const stream = localStreamRef.current;
      if (!stream) return;

      createPeer(senderId, stream, false);
      peersRef.current.get(senderId)?.signal(signal);
    };

    const handleUserLeft = (payload = {}) => {
      const peerId = getPeerId(payload);
      if (peerId) removePeer(peerId);
    };

    const joinVoice = () => {
      if (localStreamRef.current && socket.connected) {
        socket.emit("join-voice", { roomId });
      }
    };

    const handleAudioControl = ({ muted } = {}) => {
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (!audioTrack || typeof muted !== "boolean") return;

      audioTrack.enabled = !muted;
      setIsMuted(muted);
      setCanSpeak(!muted);
    };

    const startVoice = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser does not support microphone access.");
        setStatus("error");
        return;
      }

      try {
        setStatus("connecting");
        setError("");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        });

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        activeStream = stream;
        localStreamRef.current = stream;
        stream.getAudioTracks().forEach((track) => {
          track.enabled = isHost || hasAudioApproval;
        });
        setIsMuted(!(isHost || hasAudioApproval));
        setCanSpeak(isHost || hasAudioApproval);
        setStatus("connected");
        joinVoice();
      } catch (mediaError) {
        setError(
          mediaError.name === "NotAllowedError"
            ? "Microphone permission is blocked. Allow access in your browser settings."
            : "Unable to access the microphone."
        );
        setStatus("error");
      }
    };

    socket.on("voice-users", handleVoiceUsers);
    socket.on("voice-signal", handleSignal);
    socket.on("return-voice-signal", handleSignal);
    socket.on("user-left-voice", handleUserLeft);
    socket.on("user-disconnected-voice", handleUserLeft);
    socket.on("audio-control", handleAudioControl);
    socket.on("connect", joinVoice);
    startVoice();

    return () => {
      disposed = true;
      socket.emit("leave-voice", { roomId });
      socket.off("voice-users", handleVoiceUsers);
      socket.off("voice-signal", handleSignal);
      socket.off("return-voice-signal", handleSignal);
      socket.off("user-left-voice", handleUserLeft);
      socket.off("user-disconnected-voice", handleUserLeft);
      socket.off("audio-control", handleAudioControl);
      socket.off("connect", joinVoice);
      activePeers.forEach((peer) => peer.destroy());
      activePeers.clear();
      activeStream?.getTracks().forEach((track) => track.stop());
      setRemoteStreams([]);
      setCanSpeak(false);
      setStatus("idle");
    };
  }, [createPeer, enabled, hasAudioApproval, isHost, removePeer, retryToken, roomId, roomReady, socket]);

  const toggleMute = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack) return;
    if (!audioTrack.enabled && !canSpeak) return;

    audioTrack.enabled = !audioTrack.enabled;
    setIsMuted(!audioTrack.enabled);
  };

  const reconnect = () => {
    setError("");
    setStatus("connecting");
    setRetryToken((token) => token + 1);
  };

  return {
    error,
    canSpeak,
    isMuted,
    isVoiceConnected: status === "connected",
    reconnect,
    remoteStreams,
    status,
    toggleMute,
  };
}
