import React, { createContext, useContext, useState } from 'react';
import httpClient from '../services/httpClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('codesync.user');
    return saved ? JSON.parse(saved) : null;
  });

  const authenticate = async (displayName) => {
    const { data: authenticatedUser } = await httpClient.post('/auth/guest', {
      displayName: displayName.trim() || 'Anonymous',
    });
    const nextUser = {
      id: authenticatedUser.token,
      token: authenticatedUser.token,
      displayName: authenticatedUser.displayName,
      isGuest: true,
    };
    localStorage.setItem('codesync.user', JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  };

  const updateDisplayName = (name) => {
    setUser((prev) => {
      const next = { ...prev, displayName: name };
      localStorage.setItem('codesync.user', JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ user, authenticate, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);