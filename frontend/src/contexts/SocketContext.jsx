import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const SocketContext = createContext();

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'ws://localhost:8080/ws';

class CollaborationSocket {
  constructor(url, onStatusChange) {
    this.url = url;
    this.listeners = new Map();
    this.onStatusChange = onStatusChange;
    this.ws = null;
    this.connected = false;
    this.id = null;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event, payload = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: event, ...payload }));
    }
  }

  connect() {
    if (this.ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(this.ws.readyState)) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.connected = true;
      this.id = crypto.randomUUID();
      this.onStatusChange(true);
      this.dispatch('connect', {});
    };
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.dispatch(message.type, message);
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.onStatusChange(false);
      this.dispatch('disconnect', {});
    };
    this.ws.onerror = () => this.dispatch('connect_error', {});
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  dispatch(event, payload) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }
}

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const socketInstance = new CollaborationSocket(SOCKET_URL, setIsConnected);
    socketRef.current = socketInstance;
    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const connectSocket = () => {
    if (socketRef.current && !socketRef.current.connected) socketRef.current.connect();
  };

  const disconnectSocket = () => {
    if (socketRef.current?.connected) socketRef.current.disconnect();
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, connectSocket, disconnectSocket }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocketContext = () => useContext(SocketContext);