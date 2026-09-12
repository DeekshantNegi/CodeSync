import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';

export default function HistoryView() {
  const navigate = useNavigate();

  const sessions = [
    { id: 'sync-8f92a4', name: '#sync-8f92a4 (Current Session)', meta: 'Active 12m ago • 2 Participants • 18 Messages', isCurrent: true },
    { id: 'interview-prod-fix', name: '#interview-prod-fix', meta: 'Yesterday at 4:30 PM • 4 Participants • 42 Messages', isCurrent: false },
    { id: 'algo-practice-session', name: '#algo-practice-session', meta: 'Sep 04, 2026 • 3 Participants • 105 Messages', isCurrent: false }
  ];

  return (
    <div className="h-full w-full max-w-4xl mx-auto p-8 flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Session & Chat History</h2>
          <p className="text-xs text-[#94a3b8] mt-1">Access transcripts and saved sessions from previous rooms.</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#f1f5f9] bg-[#1e2330] border border-[#2a2f40] rounded-lg hover:bg-[#262c3d]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Lobby
        </button>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto">
        {sessions.map((s) => (
          <div key={s.id} className="bg-[#181b26] border border-[#2a2f40] p-4 rounded-xl flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold mb-1">{s.name}</h4>
              <p className="text-xs text-[#94a3b8]">{s.meta}</p>
            </div>
            {s.isCurrent ? (
              <button
                onClick={() => navigate(`/room/${s.id}`)}
                className="flex items-center gap-2 bg-[#3b82f6] text-white text-xs font-medium px-3.5 py-2 rounded-lg hover:bg-[#2563eb]"
              >
                Rejoin Workspace <ExternalLink className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button className="flex items-center gap-2 bg-[#1e2330] border border-[#2a2f40] text-xs font-medium px-3 py-2 rounded-lg hover:bg-[#262c3d]">
                <Download className="w-3.5 h-3.5" /> Export Chat Log
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}