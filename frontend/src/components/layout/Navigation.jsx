import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const routes = [
    { label: '1. Entry Lobby', path: '/' },
    { label: '2. Workspace / Editor', path: '/room/sync-8f92a4' },
    { label: '3. Chat History', path: '/history' }
  ];

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-1 bg-[#12151e] p-1.5 rounded-xl border border-[#2a2f40] shadow-2xl">
      {routes.map((r) => {
        const isActive = location.pathname === r.path || (r.path.includes('/room/') && location.pathname.startsWith('/room/'));
        return (
          <button
            key={r.path}
            onClick={() => navigate(r.path)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              isActive
                ? 'bg-[#181b26] text-[#f1f5f9] border border-[#2a2f40] shadow'
                : 'text-[#94a3b8] hover:text-[#f1f5f9]'
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}