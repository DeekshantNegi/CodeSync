import { useEffect, useRef, useState } from "react";
import {
	AlertTriangle,
	LoaderCircle,
	Mic,
	MicOff,
	PhoneOff,
	RotateCcw,
	Volume2,
	Wifi,
} from "lucide-react";
import { useWebRTC } from "../../hooks/useWebRTC";

function RemoteAudio({ stream }) {
	const audioRef = useRef(null);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		audio.srcObject = stream;
		audio.play().catch(() => {});

		return () => {
			audio.pause();
			audio.srcObject = null;
		};
	}, [stream]);

	return <audio ref={audioRef} autoPlay playsInline />;
}

export default function VoiceBar({ roomId, socket, isHost = false, roomReady = false }) {
	const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
	const [hasAudioApproval, setHasAudioApproval] = useState(false);
	const [isRequestPending, setIsRequestPending] = useState(false);
	const [audioRequest, setAudioRequest] = useState(null);
	const [callStartedAt, setCallStartedAt] = useState(null);
	const [callDuration, setCallDuration] = useState(0);
	const {
		canSpeak,
		error,
		isMuted,
		isVoiceConnected,
		reconnect,
		remoteStreams,
		status,
		toggleMute,
	} = useWebRTC(roomId, socket, isVoiceEnabled, isHost, roomReady, hasAudioApproval);

	useEffect(() => {
		if (!socket) return undefined;

		const handleAudioRequest = (request) => {
			if (isHost) setAudioRequest(request);
		};

		const handleAudioResponse = ({ approved }) => {
			setIsRequestPending(false);
			setHasAudioApproval(Boolean(approved));
			setIsVoiceEnabled(Boolean(approved));
		};

		socket.on("audio-access-request", handleAudioRequest);
		socket.on("audio-access-response", handleAudioResponse);

		return () => {
			socket.off("audio-access-request", handleAudioRequest);
			socket.off("audio-access-response", handleAudioResponse);
		};
	}, [isHost, socket]);

	useEffect(() => {
		if (!socket) return undefined;

		const updateCallState = ({ startedAt, voiceStartedAt } = {}) =>
			setCallStartedAt(startedAt || voiceStartedAt || null);
		socket.on("room-state", updateCallState);
		socket.on("voice-call-state", updateCallState);

		return () => {
			socket.off("room-state", updateCallState);
			socket.off("voice-call-state", updateCallState);
		};
	}, [socket]);

	useEffect(() => {
		if (!callStartedAt) {
			setCallDuration(0);
			return undefined;
		}

		const updateDuration = () => {
			const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(callStartedAt)) / 1000));
			setCallDuration(elapsed);
		};

		updateDuration();
		const timer = window.setInterval(updateDuration, 1000);
		return () => window.clearInterval(timer);
	}, [callStartedAt]);

	const leaveVoice = () => {
		setIsVoiceEnabled(false);
	};

	const requestOrJoinAudio = () => {
		if (!roomReady) return;

		if (!isVoiceEnabled) {
			if (isHost) {
				setIsVoiceEnabled(true);
				return;
			}

			socket?.emit("audio-access-request", {});
			setIsRequestPending(true);
			return;
		}

		if (isVoiceConnected && !canSpeak) {
			socket?.emit("audio-access-request", {});
			setIsRequestPending(true);
			return;
		}

		socket?.emit("audio-access-request", { });
		setIsRequestPending(true);
	};

	const respondToAudioRequest = (approved) => {
		if (!audioRequest?.from) return;
		socket?.emit("audio-access-response", {
			participantId: audioRequest.from,
			approved,
		});
		setAudioRequest(null);
	};

	const statusLabel =
		status === "connected"
			? canSpeak || isHost
				? `${remoteStreams.length} ${remoteStreams.length === 1 ? "person" : "people"} connected`
				: "Connected · waiting for host"
			: status === "connecting"
				? "Connecting microphone..."
				: "Audio is off";
	const formattedDuration = `${String(Math.floor(callDuration / 60)).padStart(2, "0")}:${String(callDuration % 60).padStart(2, "0")}`;

	return (
		<section className="border-b border-[#2a2f40] bg-[#10141d] p-3">
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2.5">
					<div
						className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
							isVoiceConnected
								? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
								: "border-[#303746] bg-[#1a1e28] text-[#94a3b8]"
						}`}
					>
						{isVoiceConnected ? (
							<Volume2 className="h-4 w-4" />
						) : (
							<MicOff className="h-4 w-4" />
						)}
					</div>

					<div className="min-w-0">
						<div className="flex items-center gap-1.5 text-xs font-semibold text-[#f1f5f9]">
							<span>Room audio</span>
							{isVoiceConnected && <Wifi className="h-3 w-3 text-emerald-300" />}
							{callStartedAt && <span className="font-mono text-[10px] text-emerald-300">{formattedDuration}</span>}
						</div>
						<p className="truncate text-[10px] text-[#64748b]">{statusLabel}</p>
					</div>
				</div>

				{!isVoiceEnabled && !isRequestPending ? (
					<button
						type="button"
						onClick={requestOrJoinAudio}
						className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#10b981] px-2.5 py-1.5 text-[11px] font-semibold text-[#06130f] transition-colors hover:bg-[#34d399]"
					>
						<Mic className="h-3.5 w-3.5" />
						Join audio
					</button>
				) : isRequestPending ? (
					<span className="text-[10px] font-medium text-amber-300">Request sent</span>
				) : isVoiceConnected && !canSpeak && !isHost ? (
					<button
						type="button"
						onClick={requestOrJoinAudio}
						className="rounded-lg bg-amber-400 px-2.5 py-1.5 text-[11px] font-semibold text-[#1b1300]"
					>
						Request to speak
					</button>
				) : (
					<div className="flex shrink-0 items-center gap-1.5">
						<button
							type="button"
							onClick={toggleMute}
							disabled={!isVoiceConnected}
							title={isMuted ? "Unmute microphone" : "Mute microphone"}
							className={`rounded-lg border p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
								isMuted
									? "border-amber-400/40 bg-amber-400/10 text-amber-300"
									: "border-[#303746] bg-[#1a1e28] text-[#cbd5e1] hover:border-[#64748b]"
							}`}
						>
							{isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
						</button>
						<button
							type="button"
							onClick={leaveVoice}
							title="Leave room audio"
							className="rounded-lg border border-red-400/30 bg-red-400/10 p-1.5 text-red-300 transition-colors hover:bg-red-400/20"
						>
							<PhoneOff className="h-3.5 w-3.5" />
						</button>
					</div>
				)}
			</div>

			{status === "connecting" && (
				<div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#94a3b8]">
					<LoaderCircle className="h-3 w-3 animate-spin" />
					Requesting microphone access
				</div>
			)}

			{error && (
				<div className="mt-2 flex items-start gap-2 rounded-md border border-red-400/20 bg-red-400/10 p-2 text-[10px] leading-relaxed text-red-200">
					<AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
					<span className="min-w-0 flex-1">{error}</span>
					<button
						type="button"
						onClick={reconnect}
						className="flex shrink-0 items-center gap-1 font-semibold text-red-100 hover:text-white"
					>
						<RotateCcw className="h-3 w-3" />
						Retry
					</button>
				</div>
			)}

			{audioRequest && (
				<div className="mt-2 rounded-md border border-blue-400/20 bg-blue-400/10 p-2 text-[10px] text-blue-100">
					<div className="mb-2 flex items-center gap-1.5">
						<Mic className="h-3 w-3" />
						<span>{audioRequest.displayName || "A participant"} requested room audio.</span>
					</div>
					<div className="flex gap-1.5">
						<button
							type="button"
							onClick={() => respondToAudioRequest(true)}
							className="rounded bg-emerald-400 px-2 py-1 font-semibold text-[#06130f]"
						>
							Allow
						</button>
						<button
							type="button"
							onClick={() => respondToAudioRequest(false)}
							className="rounded border border-[#445066] px-2 py-1 text-[#cbd5e1]"
						>
							Decline
						</button>
					</div>
				</div>
			)}

			{remoteStreams.map(({ peerId, stream }) => (
				<RemoteAudio key={peerId} stream={stream} />
			))}
		</section>
	);
}
