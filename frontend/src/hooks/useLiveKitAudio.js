import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Room, RoomEvent, Track } from "livekit-client";

const AUDIO_CAPTURE_OPTIONS = {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
};

function getAudioServiceOptions(token) {
  const configuredUrl = import.meta.env.VITE_AUDIO_URL;
  return {
    url: configuredUrl || window.location.origin,
    path: configuredUrl ? "/socket.io" : "/audio/socket.io",
    auth: { token },
    autoConnect: false,
    transports: ["websocket", "polling"],
  };
}

function microphoneErrorMessage(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Microphone permission was denied. Allow microphone access in your browser settings and try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone was found. Connect a microphone and try again.";
    case "NotReadableError":
    case "TrackStartError":
      return "The microphone is busy or unavailable. Close other apps using it and try again.";
    case "UnsupportedError":
      return "Your browser does not support microphone capture.";
    default:
      return `Unable to access the microphone: ${error?.message || "unknown device error."}`;
  }
}

function requestAcknowledgement(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("The audio service did not respond. Reconnecting..."));
    }, 10000);

    socket.emit(event, payload, (response) => {
      clearTimeout(timeout);
      if (!response?.ok) {
        reject(new Error(response?.error || "Unable to connect to room audio."));
        return;
      }
      resolve(response);
    });
  });
}

function closeRoom(room, audioElements) {
  if (room) {
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        if (publication.track?.kind === Track.Kind.Audio) {
          publication.track.detach().forEach((element) => element.remove());
        }
      });
    });
    room.disconnect();
  }
  audioElements.forEach((element) => element.remove());
  audioElements.clear();
}

export function useLiveKitAudio({ roomId, displayName, token, roomReady }) {
  const [participants, setParticipants] = useState([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const socketRef = useRef(null);
  const roomRef = useRef(null);
  const connectAudioRef = useRef(null);
  const audioContextRef = useRef(null);
  const participantsRef = useRef([]);
  const operationRef = useRef(0);
  const connectPromiseRef = useRef(null);
  const retryTimerRef = useRef(null);
  const retryCountRef = useRef(0);
  const broadcastWantedRef = useRef(false);
  const broadcastOperationRef = useRef(0);
  const audioElementsRef = useRef(new Set());

  const refreshParticipants = useCallback((room = roomRef.current) => {
    setParticipants(participantsRef.current.map((participant) => {
      const liveParticipant = participant.identity === room?.localParticipant.identity
        ? room.localParticipant
        : room?.remoteParticipants.get(participant.identity);
      return {
        ...participant,
        isSpeaking: Boolean(liveParticipant?.isSpeaking),
        isMuted: liveParticipant ? !liveParticipant.isMicrophoneEnabled : true,
      };
    }));
  }, []);

  const cleanup = useCallback((updateState = true) => {
    operationRef.current += 1;
    broadcastOperationRef.current += 1;
    broadcastWantedRef.current = false;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    retryCountRef.current = 0;
    connectPromiseRef.current = null;

    const socket = socketRef.current;
    const room = roomRef.current;
    socketRef.current = null;
    roomRef.current = null;
    audioContextRef.current = null;
    participantsRef.current = [];

    closeRoom(room, audioElementsRef.current);
    if (socket) {
      if (socket.connected) socket.emit("audio:leave");
      socket.disconnect();
    }

    if (updateState) {
      setParticipants([]);
      setConnected(false);
      setConnecting(false);
      setIsHost(false);
      setBroadcasting(false);
      setPlaybackBlocked(false);
    }
  }, []);

  const connectAudio = useCallback((socket, operation) => {
    if (connectPromiseRef.current) return connectPromiseRef.current;
    const connection = (async () => {
      const joinResponse = await requestAcknowledgement(socket, "audio:join", { roomId, displayName });
      if (operation !== operationRef.current || socketRef.current !== socket || !socket.connected) return;

      const room = new Room({ adaptiveStream: true, dynacast: true });
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        track.attach().forEach((element) => {
          element.autoplay = true;
          element.setAttribute("playsinline", "true");
          audioElementsRef.current.add(element);
          document.body.appendChild(element);
          element.play().catch(() => setPlaybackBlocked(true));
        });
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((element) => {
          audioElementsRef.current.delete(element);
          element.remove();
        });
      });
      room.on(RoomEvent.TrackMuted, () => refreshParticipants(room));
      room.on(RoomEvent.TrackUnmuted, () => refreshParticipants(room));
      room.on(RoomEvent.ParticipantConnected, () => refreshParticipants(room));
      room.on(RoomEvent.ParticipantDisconnected, () => refreshParticipants(room));
      room.on(RoomEvent.ActiveSpeakersChanged, () => refreshParticipants(room));
      room.on(RoomEvent.AudioPlaybackStatusChanged, (playing) => setPlaybackBlocked(!playing));
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current !== room || operation !== operationRef.current) return;
        roomRef.current = null;
        closeRoom(room, audioElementsRef.current);
        participantsRef.current = [];
        setParticipants([]);
        setConnected(false);
        setBroadcasting(false);
        if (socketRef.current === socket && socket.connected) {
          setConnecting(true);
          setError("Audio connection lost. Reconnecting...");
          socket.emit("audio:leave", () => connectAudioRef.current?.(socket, operation));
        }
      });

      roomRef.current = room;
      try {
        await room.connect(joinResponse.serverUrl, joinResponse.token);
      } catch (connectError) {
        if (roomRef.current === room) roomRef.current = null;
        closeRoom(room, audioElementsRef.current);
        if (socket.connected) socket.emit("audio:leave");
        throw connectError;
      }

      if (operation !== operationRef.current || socketRef.current !== socket || !socket.connected) {
        if (roomRef.current === room) roomRef.current = null;
        closeRoom(room, audioElementsRef.current);
        return;
      }

      participantsRef.current = [joinResponse.participant];
      setIsHost(joinResponse.isHost);
      setConnected(true);
      setConnecting(false);
      setError("");
      retryCountRef.current = 0;
      refreshParticipants(room);

      if (joinResponse.isHost && broadcastWantedRef.current) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true, AUDIO_CAPTURE_OPTIONS);
          if (operation === operationRef.current && roomRef.current === room) {
            setBroadcasting(true);
          }
        } catch (microphoneError) {
          broadcastWantedRef.current = false;
          setBroadcasting(false);
          setError(microphoneErrorMessage(microphoneError));
        }
      }
    })()
      .catch((connectError) => {
        if (operation !== operationRef.current || socketRef.current !== socket) return;
        setConnected(false);
        setConnecting(true);
        setError(connectError.message || "Unable to connect to room audio. Reconnecting...");
        if (socket.connected && !retryTimerRef.current) {
          const delay = Math.min(1000 * (2 ** retryCountRef.current), 30000);
          retryCountRef.current += 1;
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            socket.emit("audio:leave", () => connectAudioRef.current?.(socket, operation));
          }, delay);
        }
      })
      .finally(() => {
        if (connectPromiseRef.current === connection) connectPromiseRef.current = null;
      });
    connectPromiseRef.current = connection;
    return connection;
  }, [displayName, refreshParticipants, roomId]);

  useEffect(() => {
    if (!roomReady || !token) return undefined;
    let operation = ++operationRef.current;
    connectAudioRef.current = connectAudio;
    audioContextRef.current = { roomId, token };

    const audioServiceOptions = getAudioServiceOptions(token);
    const socket = io(audioServiceOptions.url, audioServiceOptions);
    socketRef.current = socket;

    const handleConnect = () => {
      if (socketRef.current !== socket || operation !== operationRef.current) return;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      setError("");
      void connectAudio(socket, operation);
    };
    const handleDisconnect = () => {
      if (socketRef.current !== socket || operation !== operationRef.current) return;
      operation = ++operationRef.current;
      const room = roomRef.current;
      roomRef.current = null;
      closeRoom(room, audioElementsRef.current);
      participantsRef.current = [];
      setParticipants([]);
      setConnected(false);
      setBroadcasting(false);
      connectPromiseRef.current = null;
      setConnecting(true);
      setError("Audio connection lost. Reconnecting...");
    };
    const handleConnectError = (connectError) => {
      if (socketRef.current !== socket || operation !== operationRef.current) return;
      setConnecting(true);
      setError(connectError.message || "Unable to connect to room audio. Retrying...");
    };
    const handleParticipants = ({ participants: nextParticipants }) => {
      if (socketRef.current !== socket) return;
      participantsRef.current = nextParticipants || [];
      refreshParticipants();
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("audio:participants", handleParticipants);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("audio:participants", handleParticipants);
      if (connectAudioRef.current === connectAudio) connectAudioRef.current = null;
      if (socketRef.current === socket) cleanup();
    };
  }, [cleanup, connectAudio, refreshParticipants, roomId, roomReady, token]);

  const setHostBroadcasting = useCallback(async (nextBroadcasting) => {
    const room = roomRef.current;
    if (!room || !connected || !isHost || broadcastWantedRef.current === nextBroadcasting) return;
    const operation = ++broadcastOperationRef.current;
    broadcastWantedRef.current = nextBroadcasting;
    setError("");

    try {
      await room.localParticipant.setMicrophoneEnabled(nextBroadcasting, AUDIO_CAPTURE_OPTIONS);
      if (operation !== broadcastOperationRef.current || roomRef.current !== room) {
        if (nextBroadcasting) await room.localParticipant.setMicrophoneEnabled(false);
        return;
      }
      setBroadcasting(nextBroadcasting);
    } catch (broadcastError) {
      if (operation !== broadcastOperationRef.current) return;
      broadcastWantedRef.current = false;
      setBroadcasting(false);
      setError(nextBroadcasting
        ? microphoneErrorMessage(broadcastError)
        : `Unable to stop broadcasting: ${broadcastError.message}`);
    }
  }, [connected, isHost]);

  const resumePlayback = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      await Promise.all([...audioElementsRef.current].map((element) => element.play()));
      setPlaybackBlocked(false);
    } catch {
      setPlaybackBlocked(true);
      setError("Room audio is blocked by your browser. Allow audio playback and try again.");
    }
  }, []);

  return {
    broadcasting,
    connected,
    connecting,
    error,
    isHost,
    participants,
    playbackBlocked,
    resumePlayback,
    setHostBroadcasting,
  };
}
