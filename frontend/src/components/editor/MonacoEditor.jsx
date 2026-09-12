import React from 'react';
import Editor from '@monaco-editor/react';

export default function MonacoEditor({ activeFile, code, onChange }) {
  return (
    <div className="flex-1 w-full h-full relative">
      <Editor
        height="100%"
        defaultLanguage="javascript"
        path={activeFile}
        theme="vs-dark"
        value={code}
        onChange={onChange}
        options={{
          fontSize: 13,
          fontFamily: 'Fira Code, monospace',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 12 },
          lineNumbersMinChars: 3
        }}
      />
      {/* Remote Peer Cursor Marker Overlay */}
      <div className="absolute top-12 left-64 pointer-events-none flex flex-col items-start">
        <div className="w-[2px] h-5 bg-[#14b8a6]"></div>
        <span className="bg-[#14b8a6] text-black font-semibold text-[10px] px-1 rounded-sm -mt-6">
          Sarah
        </span>
      </div>
    </div>
  );
}