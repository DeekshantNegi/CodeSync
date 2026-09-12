import React from 'react';
import { Plus, FileCode } from 'lucide-react';

export default function FileExplorer({ files, activeFile, onSelectFile, onAddFile }) {
  return (
    <aside className="w-52 bg-[#12151e] border-r border-[#2a2f40] flex flex-col select-none">
      <div className="p-3 text-[11px] font-semibold tracking-wider text-[#64748b] uppercase border-b border-[#2a2f40] flex justify-between items-center">
        Files
        <button onClick={onAddFile} className="text-[#94a3b8] hover:text-[#f1f5f9] transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2 space-y-0.5 text-xs">
        {files.map((file) => (
          <div
            key={file}
            onClick={() => onSelectFile(file)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
              activeFile === file ? 'bg-[#1e2330] text-[#f1f5f9]' : 'text-[#94a3b8] hover:bg-[#1e2330] hover:text-[#f1f5f9]'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-[#64748b]" />
            {file}
          </div>
        ))}
      </div>
    </aside>
  );
}