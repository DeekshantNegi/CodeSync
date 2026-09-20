import React from 'react';
import { Code2, History, LogIn, LogOut, UserCircle, UserPlus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function AppTopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-[#2a2f40] bg-[#10131b]/95 px-5 backdrop-blur-md">
      <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 text-sm font-bold">
        <Code2 className="h-5 w-5 text-[#3b82f6]" /> CodeSync
      </button>
      <nav className="flex items-center gap-2">
        {user && (
          <>
            <button type="button" onClick={() => navigate('/history')} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs ${location.pathname === '/history' ? 'bg-[#1e2330] text-white' : 'text-[#94a3b8] hover:text-white'}`}>
              <History className="h-3.5 w-3.5" /> History
            </button>
            <button type="button" onClick={() => navigate('/profile')} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-[#94a3b8] hover:text-white">
              <UserCircle className="h-3.5 w-3.5" /> {user.displayName}
            </button>
            <button type="button" onClick={signOut} title="Sign out" className="rounded-lg border border-[#2a2f40] p-2 text-[#94a3b8] hover:text-white">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {!user && (
          <>
            <button type="button" onClick={() => navigate('/auth?mode=signin')} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-[#cbd5e1] hover:bg-[#1e2330]">
              <LogIn className="h-3.5 w-3.5" /> Sign in
            </button>
            <button type="button" onClick={() => navigate('/auth?mode=signup')} className="flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2563eb]">
              <UserPlus className="h-3.5 w-3.5" /> Sign up
            </button>
          </>
        )}
      </nav>
    </header>
  );
}