import React from 'react';
import { Play } from 'lucide-react';

export default function TerminalPanel({ logs, onRunCode }) {
  return (
    <div className="h-36 bg-[#12151e] border-t border-[#2a2f40] flex flex-col select-none">
      <div className="p-2 text-[11px] font-semibold tracking-wider text-[#64748b] uppercase border-b border-[#2a2f40] flex justify-between items-center">
        Output / Terminal
        <button
          onClick={onRunCode}
          className="flex items-center gap-1 text-[11px] text-[#3b82f6] hover:underline"
        >
          <Play className="w-3 h-3" /> Run Code
        </button>
      </div>
      <div className="p-3 font-mono text-xs text-[#94a3b8] overflow-y-auto space-y-1">
        {logs.map((log, index) => (
          <div key={index}>&gt; {log}</div>
        ))}
      </div>
    </div>
  );
}