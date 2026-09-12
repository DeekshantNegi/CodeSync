import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

const YJS_WS_URL = import.meta.env.VITE_YJS_WS_URL || 'ws://localhost:1234';

export function useYjs({ roomId, editorRef, user }) {
  const providerRef = useRef(null);
  const bindingRef = useRef(null);

  useEffect(() => {
    if (!roomId || !editorRef.current) return;

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(YJS_WS_URL, roomId, ydoc);
    providerRef.current = provider;

    const yText = ydoc.getText('monaco');
    const model = editorRef.current.getModel();

    // Set local awareness metadata (cursor label and color)
    provider.awareness.setLocalStateField('user', {
      name: user.displayName,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16),
    });

    const binding = new MonacoBinding(
      yText,
      model,
      new Set([editorRef.current]),
      provider.awareness
    );
    bindingRef.current = binding;

    return () => {
      binding.destroy();
      provider.destroy();
      ydoc.destroy();
    };
  }, [roomId, editorRef, user]);

  return { provider: providerRef.current };
}