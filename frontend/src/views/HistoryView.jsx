import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import httpClient from '../services/httpClient';

export default function HistoryView() {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  useEffect(() => { httpClient.get('/history').then(({ data }) => setSessions(data)).catch(() => setSessions([])); }, []);

  return (
    <div className="h-full w-full max-w-4xl mx-auto overflow-y-auto px-8 pb-8 pt-20 flex flex-col">
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
        {sessions.length === 0 && <p className="text-sm text-[#64748b]">No rooms visited yet.</p>}
        {sessions.map((s) => (
          <div key={s.roomCode} className="bg-[#181b26] border border-[#2a2f40] p-4 rounded-xl flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold mb-1">#{s.roomCode}</h4>
              <p className="text-xs text-[#94a3b8]">{s.role} · {new Date(s.lastVisitedAt).toLocaleString()}</p>
            </div>
            {s.roomCode ? (
              <button
                onClick={() => navigate(`/room/${s.roomCode}`)}
                className="flex items-center gap-2 bg-[#3b82f6] text-white text-xs font-medium px-3.5 py-2 rounded-lg hover:bg-[#2563eb]"
              >
                Rejoin <ExternalLink className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}