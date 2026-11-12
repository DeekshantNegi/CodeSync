import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import LobbyView from "./views/LobbyView";
import WorkspaceView from "./views/WorkspaceView";
import HistoryView from "./views/HistoryView";
import ProfileView from "./views/ProfileView";
import AuthView from "./views/AuthView";
import AppTopBar from "./components/layout/AppTopBar";

import { SocketProvider } from "./contexts/SocketContext";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./contexts/AuthContext";

function RequireAuth({ children }) {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <div className="flex h-screen items-center justify-center bg-[#090a0f] text-sm text-[#94a3b8]">Restoring your session...</div>;
  return user ? children : <Navigate to="/auth?mode=signin" replace state={{ from: window.location.pathname }} />;
}

function AppShell({ children }) {
  return <><AppTopBar />{children}</>;
}

export default function App() {
  return (
    <Router>

      <AuthProvider>
      <SocketProvider>
        <div className="h-screen w-screen bg-[#090a0f] text-[#f1f5f9] overflow-hidden">
          <Routes>
            <Route path="/" element={<AppShell><LobbyView /></AppShell>} />
            <Route path="/auth" element={<AuthView />} />
            <Route path="/room/:roomId" element={<RequireAuth><WorkspaceView /></RequireAuth>} />
            <Route path="/history" element={<RequireAuth><AppShell><HistoryView /></AppShell></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><AppShell><ProfileView /></AppShell></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

      </SocketProvider>
      </AuthProvider>

    </Router>
  );
}