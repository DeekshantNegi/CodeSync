import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const SocketContext = createContext();

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

class CollaborationSocket {
  constructor(url, onStatusChange) {
    this.url = url;
    this.listeners = new Map();
    this.onStatusChange = onStatusChange;
    this.ws = null;
    this.connected = false;
    this.id = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.shouldReconnect = true;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event, payload = {}) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;

    this.ws.send(JSON.stringify({ type: event, ...payload }));
    return true;
  }

  connect() {
    if (this.ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(this.ws.readyState)) return;

    this.shouldReconnect = true;
    this.onStatusChange(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.connected = true;
        this.reconnectAttempt = 0;
        this.id = null;
        this.onStatusChange('connected');
        this.dispatch('connect', {});
      };
      ws.onmessage = (event) => {
        if (this.ws !== ws) return;

        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          this.dispatch('protocol_error', { message: 'Received invalid server data.' });
          return;
        }

        if (!message || typeof message.type !== 'string') {
          this.dispatch('protocol_error', { message: 'Received an unsupported server message.' });
          return;
        }
        this.dispatch(message.type, message);
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.connected = false;
        this.onStatusChange('disconnected');
        this.dispatch('disconnect', {});
        this.scheduleReconnect();
      };
      ws.onerror = () => {
        if (this.ws === ws) this.dispatch('connect_error', {});
      };
    } catch (error) {
      this.connected = false;
      this.onStatusChange('error');
      this.dispatch('connect_error', { message: error.message });
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    this.onStatusChange('disconnected');
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
    this.dispatch('disconnect', {});
  }

  scheduleReconnect() {
    if (!this.shouldReconnect || this.reconnectTimer) return;

    const backoff = Math.min(1000 * 2 ** this.reconnectAttempt, 10000);
    const delay = Math.round(backoff * (0.8 + Math.random() * 0.4));
    this.reconnectAttempt += 1;
    this.onStatusChange('reconnecting');
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  dispatch(event, payload) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }
}

export function SocketProvider({ children }) {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [socket] = useState(() => new CollaborationSocket(SOCKET_URL, setConnectionStatus));

  useEffect(() => {
    return () => socket.disconnect();
  }, [socket]);

  const connectSocket = useCallback(() => {
    socket.connect();
  }, [socket]);

  const disconnectSocket = useCallback(() => {
    socket.disconnect();
  }, [socket]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connectionStatus,
        isConnected: connectionStatus === 'connected',
        connectSocket,
        disconnectSocket,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export const useSocketContext = () => useContext(SocketContext);
