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

export default function VoiceBar({ roomId, socket }) {
	const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
	const {
		error,
		isMuted,
		isVoiceConnected,
		reconnect,
		remoteStreams,
		status,
		toggleMute,
	} = useWebRTC(roomId, socket, isVoiceEnabled);

	const leaveVoice = () => {
		setIsVoiceEnabled(false);
	};

	const statusLabel =
		status === "connected"
			? `${remoteStreams.length} ${remoteStreams.length === 1 ? "person" : "people"} connected`
			: status === "connecting"
				? "Connecting microphone..."
				: "Audio is off";

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
						</div>
						<p className="truncate text-[10px] text-[#64748b]">{statusLabel}</p>
					</div>
				</div>

				{!isVoiceEnabled ? (
					<button
						type="button"
						onClick={() => setIsVoiceEnabled(true)}
						className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#10b981] px-2.5 py-1.5 text-[11px] font-semibold text-[#06130f] transition-colors hover:bg-[#34d399]"
					>
						<Mic className="h-3.5 w-3.5" />
						Join audio
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

			{remoteStreams.map(({ peerId, stream }) => (
				<RemoteAudio key={peerId} stream={stream} />
			))}
		</section>
	);
}
