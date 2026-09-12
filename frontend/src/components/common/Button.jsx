import React from 'react';

export default function Button({ children, onClick, variant = 'primary', className = '', ...props }) {
  const baseStyle = "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-[#3b82f6] hover:bg-[#2563eb] text-white",
    secondary: "bg-[#1e2330] hover:bg-[#262c3d] border border-[#2a2f40] text-[#f1f5f9]",
    danger: "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/20",
  };

  return (
    <button onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}