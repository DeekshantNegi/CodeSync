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
    </div>
  );
}