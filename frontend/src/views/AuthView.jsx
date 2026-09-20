import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Code2 } from 'lucide-react';
import AppTopBar from '../components/layout/AppTopBar';
import { useAuth } from '../contexts/AuthContext';

export default function AuthView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState(new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'signin');
  const [form, setForm] = useState({ email: '', displayName: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to={location.state?.from || '/'} replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') await signUp(form);
      else await signIn({ email: form.email, password: form.password });
      navigate(location.state?.from || '/');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] px-5 pt-14 text-[#f1f5f9]">
      <AppTopBar />
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center py-12">
        <form onSubmit={submit} className="w-full rounded-xl border border-[#2a2f40] bg-[#12151e] p-7 shadow-2xl">
          <div className="mb-7 text-center"><Code2 className="mx-auto mb-3 h-8 w-8 text-[#3b82f6]" /><h1 className="text-xl font-bold">{mode === 'signup' ? 'Create your CodeSync account' : 'Welcome back'}</h1><p className="mt-1 text-xs text-[#94a3b8]">Your rooms and profile stay with your account.</p></div>
          <div className="space-y-4">
            {mode === 'signup' && <label className="block text-xs text-[#94a3b8]">Display name<input required minLength={2} maxLength={100} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#2a2f40] bg-[#10131b] px-3 text-sm text-white outline-none focus:border-[#3b82f6]" /></label>}
            <label className="block text-xs text-[#94a3b8]">Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#2a2f40] bg-[#10131b] px-3 text-sm text-white outline-none focus:border-[#3b82f6]" /></label>
            <label className="block text-xs text-[#94a3b8]">Password<input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#2a2f40] bg-[#10131b] px-3 text-sm text-white outline-none focus:border-[#3b82f6]" /></label>
          </div>
          {error && <p className="mt-4 text-xs text-red-300">{error}</p>}
          <button disabled={busy} className="mt-6 h-10 w-full rounded-lg bg-[#3b82f6] text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          <button type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')} className="mt-4 w-full text-xs text-[#94a3b8] hover:text-white">{mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
        </form>
      </main>
    </div>
  );
}