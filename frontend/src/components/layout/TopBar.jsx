import React from 'react';
import { Code2, Copy } from 'lucide-react';

export default function TopBar({ roomId, onLeave }) {
  return (
    <header className="h-12 bg-[#12151e] border-b border-[#2a2f40] px-4 flex items-center justify-between select-none">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Code2 className="w-5 h-5 text-[#3b82f6]" />
          <span>CodeSync</span>
        </div>
        <div className="flex items-center gap-2 bg-[#181b26] border border-[#2a2f40] px-2.5 py-1 rounded text-xs font-mono">
          <span>#{roomId}</span>
          <button onClick={() => navigator.clipboard.writeText(roomId)} className="text-[#94a3b8] hover:text-[#f1f5f9]">
            <Copy className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
        <span className="w-2 h-2 rounded-full bg-[#10b981]"></span> Connected
      </div>

      <div className="flex items-center gap-3">
        <div className="flex -space-x-1">
          <div className="w-6 h-6 rounded-full bg-[#3b82f6] text-[10px] font-bold flex items-center justify-center border border-[#12151e]">AD</div>
          <div className="w-6 h-6 rounded-full bg-[#14b8a6] text-[10px] font-bold flex items-center justify-center border border-[#12151e]">SK</div>
        </div>
        <button className="bg-[#3b82f6] text-white text-xs px-3 py-1.5 rounded font-medium hover:bg-[#2563eb]">Invite</button>
        <button onClick={onLeave} className="bg-[#1e2330] border border-[#2a2f40] text-xs px-3 py-1.5 rounded font-medium hover:bg-[#262c3d]">Leave</button>
      </div>
    </header>
  );
}