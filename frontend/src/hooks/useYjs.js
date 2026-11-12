import { useCallback, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';

const REMOTE_ORIGIN = 'codesync-remote';

function encodeUpdate(update) {
  let binary = '';
  update.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeUpdate(encoded) {
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function useYjs({
  roomId,
  socket,
  editor,
  fileName,
  content,
  roomReady,
  onContentChange,
}) {
  const documentsRef = useRef(new Map());
  const documentCleanupsRef = useRef(new Map());
  const initialContentRef = useRef(content);
  const removeDocument = useCallback((targetFileName) => {
    const documentKey = `${roomId}:${targetFileName}`;
    const doc = documentsRef.current.get(documentKey);
    if (!doc) return;
    documentCleanupsRef.current.get(documentKey)?.(false);
    doc.destroy();
    documentsRef.current.delete(documentKey);
  }, [roomId]);

  useEffect(() => {
    initialContentRef.current = content;
  }, [content, fileName, roomId]);

  useEffect(() => {
    if (!roomId || !socket || !editor || !fileName || !roomReady) return undefined;

    const model = editor.getModel();
    if (!model) return undefined;

    const documentKey = `${roomId}:${fileName}`;
    let doc = documentsRef.current.get(documentKey);
    if (!doc) {
      doc = new Y.Doc();
      documentsRef.current.set(documentKey, doc);
    }

    const yText = doc.getText('monaco');
    const binding = new MonacoBinding(yText, model, new Set([editor]), null);
    let pendingUpdates = [];
    let flushTimer = null;

    const sendUpdate = (update) => {
      socket.emit('editor-update', {
        fileName,
        update: encodeUpdate(update),
        content: yText.toString(),
      });
    };

    const flushUpdates = () => {
      flushTimer = null;
      if (pendingUpdates.length === 0) return;
      const update = pendingUpdates.length === 1
        ? pendingUpdates[0]
        : Y.mergeUpdates(pendingUpdates);
      pendingUpdates = [];
      sendUpdate(update);
    };

    const handleDocumentUpdate = (update, origin) => {
      onContentChange(fileName, yText.toString());
      if (origin === REMOTE_ORIGIN) return;

      pendingUpdates.push(update);
      if (flushTimer === null) {
        flushTimer = window.setTimeout(flushUpdates, 50);
      }
    };

    const handleEditorUpdate = ({ fileName: updatedFile, update }) => {
      if (updatedFile !== fileName || typeof update !== 'string') return;
      try {
        Y.applyUpdate(doc, decodeUpdate(update), REMOTE_ORIGIN);
      } catch (error) {
        console.error('Unable to apply a collaborative editor update:', error);
      }
    };

    const handleSyncState = ({ fileName: updatedFile, updates, canSeed }) => {
      if (updatedFile !== fileName || !Array.isArray(updates)) return;

      try {
        updates.forEach((update) => {
          if (typeof update === 'string') {
            Y.applyUpdate(doc, decodeUpdate(update), REMOTE_ORIGIN);
          }
        });

        if (canSeed && yText.length === 0 && initialContentRef.current) {
          yText.insert(0, initialContentRef.current);
        }

        const completeState = Y.encodeStateAsUpdate(doc);
        if (completeState.length > 2) sendUpdate(completeState);
      } catch (error) {
        console.error('Unable to synchronize the collaborative editor:', error);
      }
    };

    const handleSeedAvailable = ({ fileName: availableFile }) => {
      if (availableFile === fileName) {
        socket.emit('editor-sync-request', { fileName });
      }
    };

    const handleFileDelete = ({ fileName: deletedFile }) => {
      if (deletedFile) removeDocument(deletedFile);
    };

    const handleConnect = () => {
      socket.emit('editor-sync-request', { fileName });
    };

    let effectDisposed = false;
    const disposeEffect = (flushPending = true) => {
      if (effectDisposed) return;
      effectDisposed = true;
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      flushTimer = null;
      if (flushPending) flushUpdates();
      else pendingUpdates = [];
      doc.off('update', handleDocumentUpdate);
      socket.off('editor-update', handleEditorUpdate);
      socket.off('editor-sync-state', handleSyncState);
      socket.off('editor-seed-available', handleSeedAvailable);
      socket.off('file-delete', handleFileDelete);
      socket.off('connect', handleConnect);
      binding.destroy();
      if (documentCleanupsRef.current.get(documentKey) === disposeEffect) {
        documentCleanupsRef.current.delete(documentKey);
      }
    };

    doc.on('update', handleDocumentUpdate);
    documentCleanupsRef.current.set(documentKey, disposeEffect);
    socket.on('editor-update', handleEditorUpdate);
    socket.on('editor-sync-state', handleSyncState);
    socket.on('editor-seed-available', handleSeedAvailable);
    socket.on('file-delete', handleFileDelete);
    socket.on('connect', handleConnect);
    socket.emit('editor-sync-request', { fileName });

    return () => {
      disposeEffect();
    };
  }, [editor, fileName, onContentChange, removeDocument, roomId, roomReady, socket]);

  useEffect(() => {
    const documents = documentsRef.current;
    const cleanups = documentCleanupsRef.current;

    return () => {
      cleanups.forEach((cleanup) => cleanup(false));
      documents.forEach((doc) => doc.destroy());
      documents.clear();
    };
  }, [roomId]);

  return { removeDocument };
}
