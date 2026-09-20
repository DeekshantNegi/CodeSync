import React, { createContext, useContext, useEffect, useState } from 'react';
import httpClient from '../services/httpClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('codesync.user');
    return saved ? JSON.parse(saved) : null;
  });

  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    if (!user?.token) {
      setIsRestoring(false);
      return;
    }

    httpClient.get('/auth/me')
      .then(({ data }) => {
        const nextUser = { ...user, id: data.id, email: data.email, displayName: data.displayName, isGuest: false };
        localStorage.setItem('codesync.user', JSON.stringify(nextUser));
        setUser(nextUser);
      })
      .catch(() => {
        localStorage.removeItem('codesync.user');
        setUser(null);
      })
      .finally(() => setIsRestoring(false));
  }, []);

  const saveUser = (authenticatedUser) => {
    const nextUser = {
      id: authenticatedUser.id,
      email: authenticatedUser.email,
      token: authenticatedUser.token,
      displayName: authenticatedUser.displayName,
      isGuest: false,
    };
    localStorage.setItem('codesync.user', JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  };

  const signUp = async (payload) => saveUser((await httpClient.post('/auth/signup', payload)).data);
  const signIn = async (payload) => saveUser((await httpClient.post('/auth/signin', payload)).data);

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

  const updateProfile = async (displayName) => {
    const { data } = await httpClient.patch('/auth/me', { displayName });
    const nextUser = { ...user, displayName: data.displayName };
    localStorage.setItem('codesync.user', JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  };

  const signOut = () => {
    localStorage.removeItem('codesync.user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isRestoring, signUp, signIn, signOut, authenticate, updateDisplayName, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);