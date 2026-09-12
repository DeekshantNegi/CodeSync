import React, { createContext, useContext, useState } from 'react';

const RoomContext = createContext();

export function RoomProvider({ children }) {
  const [roomId, setRoomId] = useState(null);
  const [participants, setParticipants] = useState([
    { name: 'Alex_Dev', role: 'Host', isSelf: true },
    { name: 'Sarah', role: 'Peer', isSelf: false },
  ]);
  const [files, setFiles] = useState(['index.js', 'server.js', 'styles.css', 'package.json']);
  const [activeFile, setActiveFile] = useState('index.js');
  const [terminalLogs, setTerminalLogs] = useState([
    'node index.js',
    'CodeSync Server Active...',
    'Connection established with 2 peers.',
  ]);

  const addTerminalLog = (log) => setTerminalLogs((prev) => [...prev, log]);

  return (
    <RoomContext.Provider
      value={{
        roomId,
        setRoomId,
        participants,
        setParticipants,
        files,
        setFiles,
        activeFile,
        setActiveFile,
        terminalLogs,
        addTerminalLog,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}

export const useRoom = () => useContext(RoomContext);