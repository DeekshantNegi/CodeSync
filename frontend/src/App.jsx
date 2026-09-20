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

import { SocketProvider } from "./contexts/SocketContext";
import { RoomProvider } from "./contexts/RoomContext";
import { AuthProvider } from "./contexts/AuthContext";

export default function App() {
  return (
    <Router>

      <AuthProvider>
      <SocketProvider>

        <RoomProvider>

          <div className="h-screen w-screen bg-[#090a0f] text-[#f1f5f9] overflow-hidden">

            <Routes>

              {/* Entry Lobby */}
              <Route
                path="/"
                element={<LobbyView />}
              />

              {/* Workspace */}
              <Route
                path="/room/:roomId"
                element={<WorkspaceView />}
              />

              {/* History */}
              <Route
                path="/history"
                element={<HistoryView />}
              />

              {/* Profile */}
              <Route
                path="/profile"
                element={<ProfileView />}
              />

              {/* Unknown Route */}
              <Route
                path="*"
                element={<Navigate to="/" replace />}
              />

            </Routes>

          </div>

        </RoomProvider>

      </SocketProvider>
      </AuthProvider>

    </Router>
  );
}