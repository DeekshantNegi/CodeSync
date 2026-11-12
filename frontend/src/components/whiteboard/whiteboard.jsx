import React, { useEffect, useRef, useState } from "react";
import { Download, Pencil, Trash2 } from "lucide-react";
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

export default function Whiteboard({ roomId, socket, roomReady = false, isHost = false }) {
  const editorRef = useRef(null);
  const applyingRemoteUpdateRef = useRef(false);
  const pendingPutRef = useRef(new Map());
  const pendingRemoveRef = useRef(new Set());
  const [editor, setEditor] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!editor || !socket || !roomId || !roomReady) return undefined;

    const applyRecords = (records) => {
      const snapshot = Object.values(records || {});
      applyingRemoteUpdateRef.current = true;

      try {
        if (snapshot.length === 0) {
          const shapeIds = [...editor.getCurrentPageShapeIds()];
          if (shapeIds.length > 0) editor.deleteShapes(shapeIds);
        } else {
          editor.store.put(snapshot);
        }
      } finally {
        applyingRemoteUpdateRef.current = false;
      }
    };

    const applyChanges = ({ put = [], remove = [] } = {}) => {
      applyingRemoteUpdateRef.current = true;
      try {
        if (remove.length > 0) editor.store.remove(remove);
        if (put.length > 0) editor.store.put(put);
      } finally {
        applyingRemoteUpdateRef.current = false;
      }
    };

    const handleRoomState = ({ whiteboard }) => {
      if (!whiteboard) return;
      applyRecords(whiteboard);
    };

    const handleWhiteboardUpdate = ({ changes }) => {
      if (changes) applyChanges(changes);
    };

    let flushTimer = null;

    const flushChanges = () => {
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pendingPutRef.current.size === 0 && pendingRemoveRef.current.size === 0) return;

      const sent = socket.emit("whiteboard-update", {
        changes: {
          put: [...pendingPutRef.current.values()],
          remove: [...pendingRemoveRef.current],
        },
      });
      if (sent) {
        pendingPutRef.current.clear();
        pendingRemoveRef.current.clear();
      }
    };

    const stopListening = editor.store.listen(({ source, changes }) => {
      if (source !== "user" || applyingRemoteUpdateRef.current) return;

      Object.entries(changes.added).forEach(([id, record]) => {
        pendingRemoveRef.current.delete(id);
        pendingPutRef.current.set(id, record);
      });
      Object.entries(changes.updated).forEach(([id, [, record]]) => {
        pendingRemoveRef.current.delete(id);
        pendingPutRef.current.set(id, record);
      });
      Object.keys(changes.removed).forEach((id) => {
        pendingPutRef.current.delete(id);
        pendingRemoveRef.current.add(id);
      });

      if (flushTimer === null) {
        flushTimer = window.setTimeout(flushChanges, 50);
      }
    }, { source: "user", scope: "document" });

    socket.on("room-state", handleRoomState);
    socket.on("whiteboard-update", handleWhiteboardUpdate);
    flushChanges();
    socket.emit("whiteboard-sync-request", {});

    return () => {
      flushChanges();
      stopListening();
      socket.off("room-state", handleRoomState);
      socket.off("whiteboard-update", handleWhiteboardUpdate);
    };
  }, [editor, roomId, roomReady, socket]);

  const clearWhiteboard = () => {
    if (!isHost) return;
    const editor = editorRef.current;

    if (!editor) return;

    const confirmed = window.confirm(
      "Are you sure you want to clear the entire whiteboard?"
    );

    if (!confirmed) return;

    editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
  };

  const exportWhiteboard = async () => {
    const editor = editorRef.current;

    if (!editor) return;

    try {
      setIsExporting(true);

      const blob = await editor.toImage({
        ids: [...editor.getCurrentPageShapeIds()],
        format: "png",
        background: true,
        padding: 32,
      });

      const imageUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");

      downloadLink.href = imageUrl;
      downloadLink.download = "codesync-whiteboard.png";
      downloadLink.click();

      URL.revokeObjectURL(imageUrl);
    } catch (error) {
      console.error("Whiteboard export failed:", error);
      window.alert("Unable to export the whiteboard.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#090a0f] text-slate-100">
      {/* Whiteboard Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252936] bg-[#11131b] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#303746] bg-[#1b1f2b]">
            <Pencil className="h-5 w-5 text-blue-400" />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Collaborative Canvas
            </h2>

            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
              <span className={`h-2 w-2 rounded-full ${roomReady ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span>{roomReady ? "Live classroom workspace" : "Waiting for room connection"}</span>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={clearWhiteboard}
            disabled={!roomReady || !isHost}
            className="flex items-center gap-1.5 rounded-lg border border-[#343946] bg-[#1a1e28] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>

          <button
            type="button"
            onClick={exportWhiteboard}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {isExporting ? "Exporting..." : "Export PNG"}
          </button>
        </div>
      </header>

      {/* Whiteboard Area */}
      <div className={`relative min-h-0 flex-1 overflow-hidden bg-[#e9edf2] [&_.tl-container]:!font-sans ${
        roomReady && isHost ? "" : "pointer-events-none opacity-70"
      }`} inert={!isHost}>
        {!isHost && roomReady && (
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-slate-100">
            Only the host can edit the whiteboard.
          </div>
        )}
        <Tldraw
          inferDarkMode={false}
          autoFocus={false}
          onMount={(editor) => {
            editorRef.current = editor;
            setEditor(editor);
          }}
        />
      </div>
    </section>
  );
}