import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Editor from "@monaco-editor/react";

import {
  Code2,
  Copy,
  Send,
  Play,
  Plus,
  FileCode,
  Trash2,
  X,
  UserPlus,
  UserMinus,
  Mic,
  MicOff,
  Terminal,
  Check,
  Pencil,
  Code,
} from "lucide-react";

import Whiteboard from "../components/whiteboard/whiteboard";
import VoiceBar from "../components/collaboration/VoiceBar";
import { useSocketContext } from "../contexts/SocketContext";
import { useAuth } from "../contexts/AuthContext";
import { executeCode } from "../services/api";

function detectLanguage(filename) {
  const extension = filename.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "js":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "py":
      return "python";
    case "java":
      return "java";
    case "cpp":
    case "c":
      return "cpp";
    case "html":
      return "html";
    case "css":
      return "css";
    case "json":
      return "json";
    default:
      return "plaintext";
  }
}

export default function WorkspaceView() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { socket } = useSocketContext();
  const { user } = useAuth();

  const displayName = location.state?.displayName || "Developer";

  useEffect(() => {
    if (socket && !socket.connected) {
      socket.connect();
    }
  }, [socket]);

  // General state
  const [activeTab, setActiveTab] = useState("chat");
  const [activeWorkspace, setActiveWorkspace] = useState("code");
  const [participants, setParticipants] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [roomReady, setRoomReady] = useState(false);
  const [participantMutes, setParticipantMutes] = useState({});

  const [inputMsg, setInputMsg] = useState("");
  const [messages, setMessages] = useState([]);

  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");

  // Output and invite state
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Files
  const [files, setFiles] = useState([
    {
      name: "main.py",
      language: "python",
      content:
        '# Python Workspace\n\ndef main():\n    print("Hello from CodeSync!")\n\nif __name__ == "__main__":\n    main()\n',
    },
    {
      name: "App.java",
      language: "java",
      content:
        '// Java Workspace\npublic class App {\n    public static void main(String[] args) {\n        System.out.println("Hello from CodeSync!");\n    }\n}\n',
    },
  ]);

  const [activeFileName, setActiveFileName] = useState("main.py");
  const filesRef = useRef(files);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const activeFile =
    files.find((file) => file.name === activeFileName) || files[0];

  useEffect(() => {
    if (!socket || !roomId) return undefined;

    const joinRoom = () => {
      if (!user?.token) return;
      setRoomReady(false);
      socket.emit("join-room", {
        roomId,
        displayName,
        token: user.token,
      });
    };

    const handleRoomState = ({ participantId, participants: nextParticipants, hostId: nextHostId, files: nextFiles, messages: nextMessages }) => {
      socket.id = participantId;
      setParticipants(nextParticipants || []);
      setHostId(nextHostId || null);
      setMessages(nextMessages || []);
      setParticipantMutes(
        Object.fromEntries(
          (nextParticipants || []).map((participant) => [
            participant.id,
            participant.id !== nextHostId,
          ])
        )
      );

      if (nextFiles && Object.keys(nextFiles).length > 0) {
        setFiles((currentFiles) =>
          Object.entries(nextFiles).map(([name, content]) => {
            const current = currentFiles.find((file) => file.name === name);
            return {
              name,
              language: current?.language || detectLanguage(name),
              content: content?.content || content || "",
            };
          })
        );
      }

      if (nextHostId === participantId) {
        filesRef.current.forEach((file) => {
          socket.emit("code-change", { fileName: file.name, content: file.content });
        });
      }
    };

    const handleRoomJoined = () => setRoomReady(true);
    const handleDisconnect = () => setRoomReady(false);

    const handleCodeChange = ({ fileName, content }) => {
      if (!fileName || content === undefined) return;
      setFiles((currentFiles) => {
        const hasFile = currentFiles.some((file) => file.name === fileName);
        if (hasFile) {
          return currentFiles.map((file) =>
            file.name === fileName ? { ...file, content } : file
          );
        }

        return [
          ...currentFiles,
          { name: fileName, language: detectLanguage(fileName), content },
        ];
      });
    };

    const handleFileDelete = ({ fileName }) => {
      if (!fileName) return;
      setFiles((currentFiles) => {
        const remainingFiles = currentFiles.filter((file) => file.name !== fileName);

        if (activeFileName === fileName && remainingFiles.length > 0) {
          setActiveFileName(remainingFiles[0].name);
        }

        return remainingFiles;
      });
    };

    const handleParticipantJoined = ({ participantId, displayName: joinedName, isHost }) => {
      setParticipants((currentParticipants) => {
        if (currentParticipants.some((participant) => participant.id === participantId)) {
          return currentParticipants;
        }

        return [
          ...currentParticipants,
          { id: participantId, name: joinedName, isHost },
        ];
      });
      setParticipantMutes((currentMutes) => ({
        ...currentMutes,
        [participantId]: !isHost,
      }));
    };

    const handleParticipantLeft = ({ participantId }) => {
      setParticipants((currentParticipants) =>
        currentParticipants.filter((participant) => participant.id !== participantId)
      );
      setParticipantMutes((currentMutes) => {
        const nextMutes = { ...currentMutes };
        delete nextMutes[participantId];
        return nextMutes;
      });
    };

    const handleHostChanged = ({ participantId }) => setHostId(participantId);

    const handleChatMessage = ({ displayName: author, text, time }) => {
      if (!text) return;
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          author: author || "Participant",
          text,
          time: time || new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    };

    socket.on("connect", joinRoom);
    socket.on("room-joined", handleRoomJoined);
    socket.on("disconnect", handleDisconnect);
    socket.on("room-state", handleRoomState);
    socket.on("code-change", handleCodeChange);
    socket.on("file-delete", handleFileDelete);
    socket.on("participant-joined", handleParticipantJoined);
    socket.on("participant-left", handleParticipantLeft);
    socket.on("host-changed", handleHostChanged);
    socket.on("chat-message", handleChatMessage);

    if (socket.connected) joinRoom();

    return () => {
      socket.off("connect", joinRoom);
      socket.off("room-joined", handleRoomJoined);
      socket.off("disconnect", handleDisconnect);
      socket.off("room-state", handleRoomState);
      socket.off("code-change", handleCodeChange);
      socket.off("file-delete", handleFileDelete);
      socket.off("participant-joined", handleParticipantJoined);
      socket.off("participant-left", handleParticipantLeft);
      socket.off("host-changed", handleHostChanged);
      socket.off("chat-message", handleChatMessage);
    };
  }, [activeFileName, displayName, roomId, socket, user?.token]);

  const handleCodeChange = (value) => {
    setFiles((previousFiles) =>
      previousFiles.map((file) =>
        file.name === activeFileName
          ? {
              ...file,
              content: value || "",
            }
          : file
      )
    );

    if (!roomReady) return;

    socket?.emit("code-change", {
      fileName: activeFileName,
      content: value || "",
    });
  };

  const handleKickParticipant = (participantId) => {
    if (!roomReady) return;

    socket?.emit("kick-user", {
      participantId,
      reason: "Removed by the host",
    });
  };

  const handleCreateFile = () => {
    const trimmedName = newFileName.trim();

    if (!trimmedName) {
      setIsCreatingFile(false);
      return;
    }

    if (files.some((file) => file.name === trimmedName)) {
      alert("File with this name already exists!");
      return;
    }

    const newFile = {
      name: trimmedName,
      language: detectLanguage(trimmedName),
      content: `// New file: ${trimmedName}\n`,
    };

    setFiles((previousFiles) => [...previousFiles, newFile]);
    if (!roomReady) return;

    socket?.emit("code-change", {
      fileName: newFile.name,
      content: newFile.content,
    });
    setActiveFileName(trimmedName);
    setNewFileName("");
    setIsCreatingFile(false);
  };

  const handleDeleteFile = (fileName, event) => {
    event.stopPropagation();

    if (files.length === 1) {
      alert("Cannot delete the last remaining file in the workspace.");
      return;
    }

    const filteredFiles = files.filter((file) => file.name !== fileName);

    setFiles(filteredFiles);
    if (!roomReady) return;

    socket?.emit("file-delete", { fileName });

    if (activeFileName === fileName) {
      setActiveFileName(filteredFiles[0].name);
    }
  };

  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput(`[Compiling ${activeFile.name}...]`);
    const result = await executeCode(
      activeFile.content,
      activeFile.language,
      user?.token,
      activeFile.name
    );
    setOutput(`${result.success ? "[Compilation successful]" : "[Compilation failed]"}\n${result.output}`);
    setIsRunning(false);
  };

  const handleSendMessage = () => {
    if (!inputMsg.trim()) return;

    if (!roomReady) return;

    socket?.emit("chat-message", {
      text: inputMsg.trim(),
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });

    setInputMsg("");
  };

  const handleParticipantMute = (participantId) => {
    const muted = participantMutes[participantId] !== false;
    if (!roomReady) return;

    socket?.emit("audio-control", { participantId, muted: !muted });
    setParticipantMutes((currentMutes) => ({
      ...currentMutes,
      [participantId]: !muted,
    }));
  };

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#090a0f] font-sans text-[#f1f5f9]">
      {/* Top Navigation */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#2a2f40] bg-[#12151e] px-4">
        <div className="flex items-center gap-4">
          <div
            className="flex cursor-pointer items-center gap-2 font-bold"
            onClick={() => navigate("/")}
          >
            <Code2 className="h-5 w-5 text-[#3b82f6]" />
            <span className="text-sm">CodeSync</span>
          </div>

          <div className="flex items-center gap-2 rounded border border-[#2a2f40] bg-[#181b26] px-2.5 py-1 font-mono text-xs">
            <span>#{roomId}</span>

            <button
              onClick={() =>
                navigator.clipboard.writeText(roomId || "")
              }
              className="text-[#94a3b8] hover:text-[#f1f5f9]"
              title="Copy Room ID"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
          <span className="h-2 w-2 rounded-full bg-[#10b981]" />
          Connected
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 rounded bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2563eb]"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Invite
          </button>

          <button
            onClick={() => navigate("/")}
            className="rounded border border-[#2a2f40] bg-[#1e2330] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[#262c3d]"
          >
            Leave Room
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* File Explorer */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-[#2a2f40] bg-[#12151e]">
          <div className="flex items-center justify-between border-b border-[#2a2f40] p-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">
            <span>Files</span>

            <button
              onClick={() => setIsCreatingFile(true)}
              className="text-[#94a3b8] transition-colors hover:text-[#f1f5f9]"
              title="Create File"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto p-2 text-xs">
            {isCreatingFile && (
              <div className="flex items-center gap-1 rounded border border-[#3b82f6] bg-[#181b26] px-2 py-1">
                <FileCode className="h-3.5 w-3.5 text-[#3b82f6]" />

                <input
                  type="text"
                  autoFocus
                  placeholder="filename.js"
                  value={newFileName}
                  onChange={(event) =>
                    setNewFileName(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleCreateFile();
                    }

                    if (event.key === "Escape") {
                      setIsCreatingFile(false);
                    }
                  }}
                  className="w-full bg-transparent text-xs text-[#f1f5f9] outline-none"
                />

                <button
                  onClick={() => setIsCreatingFile(false)}
                  className="text-[#64748b] hover:text-[#f1f5f9]"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {files.map((file) => (
              <div
                key={file.name}
                onClick={() => setActiveFileName(file.name)}
                className={`group flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 transition-colors ${
                  activeFileName === file.name
                    ? "bg-[#1e2330] font-medium text-[#f1f5f9]"
                    : "text-[#94a3b8] hover:bg-[#1e2330]/50 hover:text-[#f1f5f9]"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileCode className="h-3.5 w-3.5 shrink-0 text-[#64748b]" />
                  <span className="truncate">{file.name}</span>
                </div>

                <button
                  onClick={(event) =>
                    handleDeleteFile(file.name, event)
                  }
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="Delete File"
                >
                  <Trash2 className="h-3.5 w-3.5 text-[#64748b] hover:text-[#ef4444]" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Central Workspace */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#090a0f]">
          {/* Workspace Toggle Bar */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#2a2f40] bg-[#12151e] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#f1f5f9]">
                Classroom Workspace
              </span>

              <span className="hidden text-[11px] text-[#64748b] sm:inline">
                {activeWorkspace === "code"
                  ? "Collaborative coding environment"
                  : "Interactive visual workspace"}
              </span>
            </div>

            <div className="flex rounded-lg border border-[#2a2f40] bg-[#181b26] p-1">
              <button
                onClick={() => setActiveWorkspace("code")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeWorkspace === "code"
                    ? "bg-[#3b82f6] text-white"
                    : "text-[#94a3b8] hover:text-[#f1f5f9]"
                }`}
              >
                <Code className="h-3.5 w-3.5" />
                Code Editor
              </button>

              <button
                onClick={() => setActiveWorkspace("whiteboard")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeWorkspace === "whiteboard"
                    ? "bg-[#3b82f6] text-white"
                    : "text-[#94a3b8] hover:text-[#f1f5f9]"
                }`}
              >
                <Pencil className="h-3.5 w-3.5" />
                Whiteboard
              </button>
            </div>
          </div>

          {/* Code Workspace */}
          <div
            className={`min-h-0 flex-1 flex-col overflow-hidden ${
              activeWorkspace === "code" ? "flex" : "hidden"
            }`}
          >
            {/* Editor Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[#2a2f40] bg-[#12151e] px-2">
              <div className="flex min-w-0 overflow-x-auto">
                {files.map((file) => (
                  <div
                    key={file.name}
                    onClick={() => setActiveFileName(file.name)}
                    className={`flex cursor-pointer items-center gap-2 border-r border-[#2a2f40] px-3 py-2 font-mono text-xs ${
                      activeFileName === file.name
                        ? "border-t-2 border-t-[#3b82f6] bg-[#090a0f] text-[#3b82f6]"
                        : "text-[#64748b] hover:bg-[#181b26]"
                    }`}
                  >
                    <FileCode className="h-3.5 w-3.5" />
                    <span>{file.name}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={handleRunCode}
                disabled={isRunning}
                className="my-1 flex shrink-0 items-center gap-1.5 rounded bg-[#3b82f6] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#2563eb] disabled:opacity-50"
              >
                <Play className="h-3 w-3 fill-current" />
                {isRunning ? "Running..." : "Run Code"}
              </button>
            </div>

            {/* Monaco Editor */}
            <div className="relative min-h-0 flex-1">
              {activeFile && (
                <Editor
                  height="100%"
                  theme="vs-dark"
                  language={activeFile.language}
                  value={activeFile.content}
                  onChange={handleCodeChange}
                  options={{
                    fontSize: 14,
                    readOnly: false,
                    domReadOnly: false,
                    contextmenu: true,
                    acceptSuggestionOnCommitCharacter: true,
                    quickSuggestions: true,
                    tabCompletion: "on",
                    wordBasedSuggestions: "currentDocument",
                    unicodeHighlight: {
                      ambiguousCharacters: false,
                      invisibleCharacters: false,
                    },
                    minimap: {
                      enabled: false,
                    },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: {
                      top: 12,
                    },
                    fontFamily:
                      "Fira Code, Consolas, Monaco, 'Courier New', monospace",
                  }}
                />
              )}
            </div>

            {/* Terminal */}
            <div className="flex h-44 shrink-0 flex-col border-t border-[#2a2f40] bg-[#12151e]">
              <div className="flex shrink-0 items-center justify-between border-b border-[#2a2f40] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">
                <div className="flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5 text-[#3b82f6]" />
                  <span>Output / Terminal</span>
                </div>

                <button
                  onClick={() => setOutput("")}
                  className="text-[11px] lowercase text-[#94a3b8] hover:text-[#f1f5f9]"
                >
                  Clear
                </button>
              </div>

              <div className="flex-1 space-y-1 overflow-y-auto bg-[#090a0f]/50 p-3 font-mono text-xs">
                {output ? (
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#94a3b8]">
                    {output}
                  </pre>
                ) : (
                  <span className="italic text-[#64748b]">
                    Click "Run Code" to view output...
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Whiteboard Workspace */}
          <div
            className={`min-h-0 flex-1 overflow-hidden ${
              activeWorkspace === "whiteboard" ? "block" : "hidden"
            }`}
          >
            <Whiteboard roomId={roomId} socket={socket} roomReady={roomReady} />
          </div>
        </main>

        {/* Chat Sidebar */}
        <aside className="flex w-72 shrink-0 flex-col border-l border-[#2a2f40] bg-[#12151e]">
          <VoiceBar
            roomId={roomId}
            socket={socket}
            isHost={hostId === socket?.id}
            roomReady={roomReady}
          />

          {participants.length > 0 && (
            <div className="border-b border-[#2a2f40] p-3">
              <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
                <span>Participants</span>
                <span>{participants.length}</span>
              </div>
              <div className="space-y-1.5">
                {participants.map((participant) => (
                  <div key={participant.id} className="flex items-center justify-between rounded-md bg-[#181b26] px-2 py-1.5">
                    <span className="truncate text-xs text-[#cbd5e1]">
                      {participant.name}
                      {participant.id === hostId && <span className="ml-1 text-[10px] text-amber-300">Host</span>}
                    </span>
                    {hostId === socket?.id && participant.id !== socket?.id && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title={participantMutes[participant.id] !== false ? "Unmute participant" : "Mute participant"}
                          onClick={() => handleParticipantMute(participant.id)}
                          className="rounded p-1 text-[#64748b] hover:bg-emerald-400/10 hover:text-emerald-300"
                        >
                          {participantMutes[participant.id] !== false ? (
                            <MicOff className="h-3.5 w-3.5" />
                          ) : (
                            <Mic className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          title="Remove participant"
                          onClick={() => handleKickParticipant(participant.id)}
                          className="rounded p-1 text-[#64748b] hover:bg-red-400/10 hover:text-red-300"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex border-b border-[#2a2f40]">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 border-b-2 py-2.5 text-center text-xs font-medium ${
                activeTab === "chat"
                  ? "border-[#3b82f6] bg-[#181b26] text-[#3b82f6]"
                  : "border-transparent text-[#94a3b8]"
              }`}
            >
              Chat Room
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {messages.length === 0 ? (
                <div className="pt-8 text-center text-xs text-[#64748b]">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-1"
                  >
                    <div className="flex justify-between text-[10px] text-[#64748b]">
                      <span className="font-semibold text-[#94a3b8]">
                        {message.author}
                      </span>

                      <span>{message.time}</span>
                    </div>

                    <div className="break-words rounded-md border border-[#2a2f40] bg-[#181b26] p-2.5 text-xs text-[#f1f5f9]">
                      {message.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 border-t border-[#2a2f40] p-3">
              <input
                type="text"
                value={inputMsg}
                onChange={(event) => setInputMsg(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSendMessage();
                  }
                }}
                placeholder="Send a message..."
                className="min-w-0 flex-1 rounded-lg border border-[#2a2f40] bg-[#181b26] px-3 py-1.5 text-xs outline-none focus:border-[#3b82f6]"
              />

              <button
                onClick={handleSendMessage}
                className="rounded-lg bg-[#3b82f6] p-2 text-white transition-colors hover:bg-[#2563eb]"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-[#2a2f40] bg-[#12151e] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#f1f5f9]">
                Invite Teammates
              </h3>

              <button
                onClick={() => setShowInviteModal(false)}
                className="text-[#64748b] hover:text-[#f1f5f9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[#94a3b8]">
              Share this room link with your team to start collaborating.
            </p>

            <div className="flex items-center gap-2 rounded-lg border border-[#2a2f40] bg-[#181b26] p-2">
              <input
                type="text"
                readOnly
                value={window.location.href}
                className="min-w-0 flex-1 bg-transparent font-mono text-xs text-[#f1f5f9] outline-none"
              />

              <button
                onClick={copyRoomLink}
                className="flex items-center gap-1 rounded bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2563eb]"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}

                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}