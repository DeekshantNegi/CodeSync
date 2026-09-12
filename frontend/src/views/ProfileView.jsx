import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, GitBranch, ShieldCheck } from 'lucide-react';

export default function ProfileView() {
  const navigate = useNavigate();

  return (
    <div className="h-full w-full max-w-3xl mx-auto p-8 flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Account & Profile</h2>
          <p className="text-xs text-[#94a3b8] mt-1">Manage your user details, preferences, and authentication provider.</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#f1f5f9] bg-[#1e2330] border border-[#2a2f40] rounded-lg hover:bg-[#262c3d]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Lobby
        </button>
      </div>

      <div className="bg-[#181b26] border border-[#2a2f40] p-6 rounded-xl mb-6">
        <div className="flex items-center gap-4 pb-6 border-b border-[#2a2f40] mb-6">
          <div className="w-16 h-16 rounded-full bg-[#3b82f6] text-white text-xl font-bold flex items-center justify-center">
            AD
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-base font-semibold">Alex Developer</h3>
              <span className="flex items-center gap-1 text-[11px] font-medium bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 px-2 py-0.5 rounded">
                <ShieldCheck className="w-3 h-3" /> Guest Mode
              </span>
            </div>
            <p className="text-xs text-[#94a3b8]">alex.dev@example.com (Unverified)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748b] mb-2">Display Name</label>
            <input type="text" defaultValue="Alex_Dev" className="w-full bg-[#12151e] border border-[#2a2f40] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#3b82f6]" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748b] mb-2">Editor Theme</label>
            <select className="w-full bg-[#12151e] border border-[#2a2f40] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#3b82f6] text-[#f1f5f9]">
              <option>Dark Plus (Default)</option>
              <option>One Dark Pro</option>
              <option>Dracula</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-[#181b26] border border-[#2a2f40] p-6 rounded-xl">
        <h4 className="text-sm font-semibold mb-1">Authentication & Security</h4>
        <p className="text-xs text-[#94a3b8] mb-4">Connect a permanent account to save your room history permanently across devices.</p>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 bg-[#1e2330] border border-[#2a2f40] text-xs font-medium px-4 py-2 rounded-lg hover:bg-[#262c3d]">
            <GitBranch className="w-4 h-4" /> Connect GitHub
          </button>
          <button className="flex items-center gap-2 bg-[#1e2330] border border-[#2a2f40] text-xs font-medium px-4 py-2 rounded-lg hover:bg-[#262c3d]">
            Connect Google
          </button>
        </div>
      </div>
    </div>
  );
}