import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState({
    id: `user-${Math.random().toString(36).substring(2, 7)}`,
    displayName: 'Alex_Dev',
    isGuest: true,
  });

  const updateDisplayName = (name) => {
    setUser((prev) => ({ ...prev, displayName: name }));
  };

  return (
    <AuthContext.Provider value={{ user, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);