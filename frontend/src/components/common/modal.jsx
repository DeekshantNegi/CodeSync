import React from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#181b26] border border-[#2a2f40] rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="px-4 py-3 border-b border-[#2a2f40] flex justify-between items-center">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#f1f5f9]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}