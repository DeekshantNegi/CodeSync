import React, { useState } from 'react';
import { Send, Mic } from 'lucide-react';

export default function ChatPanel({ messages, onSendMessage, participants }) {
  const [activeTab, setActiveTab] = useState('chat');
  const [inputMsg, setInputMsg] = useState('');

  const handleSend = () => {
    if (!inputMsg.trim()) return;
    onSendMessage(inputMsg);
    setInputMsg('');
  };

  return (
    <aside className="w-80 bg-[#12151e] border-l border-[#2a2f40] flex flex-col">
      {/* Voice Bar */}
      <div className="p-3 bg-[#181b26] border-b border-[#2a2f40] flex items-center justify-between text-xs text-[#94a3b8]">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 items-end h-3">
            <span className="w-0.5 h-2 bg-[#10b981] animate-bounce"></span>
            <span className="w-0.5 h-3 bg-[#10b981] animate-bounce delay-75"></span>
            <span className="w-0.5 h-1.5 bg-[#10b981] animate-bounce delay-150"></span>
          </div>
          <span>Voice Channel Connected</span>
        </div>
        <button className="p-1 hover:bg-[#1e2330] rounded">
          <Mic className="w-4 h-4 text-[#f1f5f9]" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2a2f40]">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-2 text-xs font-medium text-center border-b-2 ${
            activeTab === 'chat' ? 'border-[#3b82f6] text-[#3b82f6] bg-[#181b26]' : 'border-transparent text-[#94a3b8]'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 py-2 text-xs font-medium text-center border-b-2 ${
            activeTab === 'users' ? 'border-[#3b82f6] text-[#3b82f6] bg-[#181b26]' : 'border-transparent text-[#94a3b8]'
          }`}
        >
          Participants ({participants.length})
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'chat' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-3 overflow-y-auto space-y-3">
            {messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] text-[#64748b]">
                  <span className="font-semibold text-[#94a3b8]">{m.author}</span>
                  <span>{m.time}</span>
                </div>
                <div className="bg-[#181b26] border border-[#2a2f40] p-2.5 rounded-md text-xs text-[#f1f5f9]">
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-[#2a2f40] flex gap-2">
            <input
              type="text"
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Send a message..."
              className="flex-1 bg-[#181b26] border border-[#2a2f40] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#3b82f6]"
            />
            <button onClick={handleSend} className="bg-[#3b82f6] text-white p-2 rounded-lg hover:bg-[#2563eb]">
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-2 text-xs">
          {participants.map((user) => (
            <div key={user.name} className="flex items-center justify-between p-2 rounded bg-[#181b26]">
              <span className="font-medium text-[#f1f5f9]">{user.name}</span>
              <span className="text-[10px] text-[#10b981]">{user.role}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}