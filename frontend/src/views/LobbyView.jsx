import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Code2,
  Plus,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import httpClient from "../services/httpClient";

export default function LobbyView() {
  const navigate = useNavigate();
  const { authenticate } = useAuth();

  const [displayName, setDisplayName] = useState("Alex_Dev");
  const [joinRoomId, setJoinRoomId] = useState("");

  // CREATE ROOM
  const handleCreateRoom = async () => {
    try {
      const user = await authenticate(displayName);
      const { data: room } = await httpClient.post("/rooms");

      navigate(`/room/${room.roomCode}`, {
        state: { displayName: user.displayName },
      });
    } catch (error) {
      window.alert(error.message);
    }
  };

  // JOIN ROOM
  const handleJoinRoom = async () => {
    const roomId = joinRoomId.trim();

    if (!roomId) {
      return;
    }

    try {
      const user = await authenticate(displayName);
      await httpClient.get(`/rooms/${encodeURIComponent(roomId)}`);
      navigate(`/room/${roomId}`, {
        state: { displayName: user.displayName },
      });
    } catch (error) {
      window.alert(error.message);
    }
  };

  // ENTER KEY FOR JOIN
  const handleJoinKeyDown = (event) => {
    if (event.key === "Enter") {
      handleJoinRoom();
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#090a0f] text-[#f1f5f9] font-sans overflow-hidden relative">

      {/* =========================================
          BACKGROUND
      ========================================== */}

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_#181b26_0%,_#090a0f_65%)]" />

      {/* =========================================
          MAIN CONTENT
      ========================================== */}

      <main className="relative z-10 min-h-screen flex justify-center px-6 pt-24 pb-32">

        <div className="w-full max-w-2xl">

          {/* =====================================
              BRANDING
          ====================================== */}

          <section className="text-center mb-12">

            <div className="flex items-center justify-center gap-3 mb-3">

              <Code2
                className="w-8 h-8 text-[#3b82f6]"
                strokeWidth={2.5}
              />

              <h1 className="text-3xl font-bold tracking-tight text-[#f1f5f9]">
                CodeSync
              </h1>

            </div>

            <p className="text-sm text-[#94a3b8]">
              Real-time collaborative workspace for engineers.
            </p>

          </section>

          {/* =====================================
              DISPLAY NAME
          ====================================== */}

          <section className="bg-[#12151e] border border-[#2a2f40] rounded-xl p-5 shadow-xl mb-6">

            <label
              htmlFor="displayName"
              className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748b] mb-2"
            >
              Your Display Name
            </label>

            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(event) =>
                setDisplayName(event.target.value)
              }
              placeholder="e.g. alex_dev"
              maxLength={30}
              className="w-full h-11 bg-[#10131b] border border-[#2a2f40] rounded-lg px-3.5 text-sm text-[#f1f5f9] outline-none placeholder:text-[#64748b] focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-all"
            />

          </section>

          {/* =====================================
              ROOM ACTIONS
          ====================================== */}

          <section className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* =================================
                CREATE ROOM
            ================================== */}

            <div className="bg-[#12151e] border border-[#2a2f40] rounded-xl p-6 min-h-[248px] flex flex-col shadow-xl">

              <div className="flex-1">

                <h2 className="text-base font-semibold text-[#f1f5f9] mb-2">
                  Create New Room
                </h2>

                <p className="text-sm text-[#94a3b8] leading-relaxed max-w-[300px]">
                  Start a fresh collaborative session and invite
                  team members with a unique link.
                </p>

              </div>

              <button
                type="button"
                onClick={handleCreateRoom}
                className="w-full h-10 bg-[#3b82f6] hover:bg-[#2563eb] active:bg-[#1d4ed8] text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
              >

                <Plus
                  className="w-4 h-4"
                  strokeWidth={2.5}
                />

                Create Instant Session

              </button>

            </div>

            {/* =================================
                JOIN ROOM
            ================================== */}

            <div className="bg-[#12151e] border border-[#2a2f40] rounded-xl p-6 min-h-[248px] flex flex-col shadow-xl">

              <div className="flex-1">

                <h2 className="text-base font-semibold text-[#f1f5f9] mb-2">
                  Join Existing Room
                </h2>

                <p className="text-sm text-[#94a3b8] leading-relaxed mb-5">
                  Enter an active room code to hop into a live
                  pair-programming session.
                </p>

                <input
                  type="text"
                  value={joinRoomId}
                  onChange={(event) =>
                    setJoinRoomId(event.target.value)
                  }
                  onKeyDown={handleJoinKeyDown}
                  placeholder="Enter Room ID (e.g. sync-8f92a4)"
                  className="w-full h-10 bg-[#10131b] border border-[#2a2f40] rounded-lg px-3 text-sm text-[#f1f5f9] font-mono outline-none placeholder:text-[#64748b] focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-all"
                />

              </div>

              <button
                type="button"
                onClick={handleJoinRoom}
                disabled={!joinRoomId.trim()}
                className="w-full h-10 bg-[#181b26] hover:bg-[#1e2330] disabled:opacity-50 disabled:cursor-not-allowed border border-[#2a2f40] text-[#f1f5f9] text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
              >

                Join Session

                <ArrowRight
                  className="w-4 h-4 text-[#3b82f6]"
                  strokeWidth={2.5}
                />

              </button>

            </div>

          </section>

        </div>

      </main>

      {/* =========================================
          BOTTOM NAVIGATION
      ========================================== */}

      <nav className="fixed z-50 bottom-10 left-1/2 -translate-x-1/2">

        <div className="flex items-center bg-black/95 border border-[#2a2f40] rounded-2xl p-1 shadow-2xl backdrop-blur-md">

          {/* ENTRY LOBBY */}

          <button
            type="button"
            onClick={() => navigate("/")}
            className="px-5 py-3 rounded-lg bg-[#181b26] border border-[#2a2f40] text-sm font-medium text-[#f1f5f9] whitespace-nowrap transition-colors"
          >
            1. Entry Lobby
          </button>

          {/* WORKSPACE */}

          <button
            type="button"
            onClick={() => navigate("/room/demo")}
            className="px-5 py-3 rounded-lg text-sm text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#12151e] transition-colors whitespace-nowrap"
          >
            2. Workspace /
            <br />
            Editor
          </button>

          {/* HISTORY */}

          <button
            type="button"
            onClick={() => navigate("/history")}
            className="px-5 py-3 rounded-lg text-sm text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#12151e] transition-colors whitespace-nowrap"
          >
            3. Chat History
          </button>

        </div>

      </nav>

    </div>
  );
}