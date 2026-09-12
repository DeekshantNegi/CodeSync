import React, { useRef, useState } from "react";
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  exportToBlob,
} from "@excalidraw/excalidraw";

import "@excalidraw/excalidraw/index.css";

export default function Whiteboard() {
  const excalidrawRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  const clearWhiteboard = () => {
    const api = excalidrawRef.current;

    if (!api) return;

    const confirmed = window.confirm(
      "Are you sure you want to clear the entire whiteboard?"
    );

    if (!confirmed) return;

    api.updateScene({
      elements: [],
      appState: {
        ...api.getAppState(),
        selectedElementIds: {},
      },
    });
  };

  const exportWhiteboard = async () => {
    const api = excalidrawRef.current;

    if (!api) return;

    try {
      setIsExporting(true);

      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();

      const blob = await exportToBlob({
        elements,
        appState,
        files,
        mimeType: "image/png",
        exportPadding: 20,
      });

      const imageUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");

      downloadLink.href = imageUrl;
      downloadLink.download = "collaborative-classroom-whiteboard.png";
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
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-400"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
              <path d="m15 5 3 3" />
            </svg>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Collaborative Whiteboard
            </h2>

            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Live classroom workspace</span>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={clearWhiteboard}
            className="rounded-lg border border-[#343946] bg-[#1a1e28] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={exportWhiteboard}
            disabled={isExporting}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? "Exporting..." : "Export PNG"}
          </button>
        </div>
      </header>

      {/* Whiteboard Area */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#e9edf2]">
        <Excalidraw
          excalidrawAPI={(api) => {
            excalidrawRef.current = api;
          }}
          theme="light"
          name="Collaborative Classroom Whiteboard"
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: true,
              clearCanvas: false,
              export: false,
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: false,
            },
          }}
          renderTopRightUI={() => (
            <div className="rounded-lg border border-[#d5dae2] bg-white/95 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
              Classroom Board
            </div>
          )}
        >
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.DefaultItems.ToggleGridMode />
            <MainMenu.DefaultItems.Help />
          </MainMenu>

          <WelcomeScreen>
            <WelcomeScreen.Hints.ToolbarHint />
            <WelcomeScreen.Hints.MenuHint />
            <WelcomeScreen.Hints.HelpHint />
          </WelcomeScreen>
        </Excalidraw>
      </div>
    </section>
  );
}