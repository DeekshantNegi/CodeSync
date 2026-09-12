import React from 'react';

export default function Input({ label, value, onChange, placeholder, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748b] mb-1.5">
          {label}
        </label>
      )}
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full bg-[#12151e] border border-[#2a2f40] rounded-lg px-3.5 py-2 text-xs outline-none focus:border-[#3b82f6] transition-colors ${className}`}
        {...props}
      />
    </div>
  );
}