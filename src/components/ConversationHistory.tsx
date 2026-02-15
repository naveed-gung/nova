import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { Message } from './VoiceAssistant';
import { ScrollArea } from './ui/scroll-area';

interface ConversationHistoryProps {
  messages: Message[];
  isOpen: boolean;
  onClose: () => void;
  onClear?: () => void;
}

/** Highlight matching text segments with a <mark> tag. */
const HighlightedText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query.trim()) return <>{text}</>;

  // Escape regex special chars in the query
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  // split() with a capture group alternates: [before, match, between, match, after]
  // Odd-indexed parts are the matches — avoids stateful regex.test() with 'g' flag
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-purple-400/40 text-inherit rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};

const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  messages,
  isOpen,
  onClose,
  onClear,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Capture the element that triggered the dialog and move focus
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      // Focus the close button after render
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else {
      // Reset search when panel closes
      setSearchQuery('');
      if (triggerRef.current) {
        triggerRef.current.focus();
        triggerRef.current = null;
      }
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use setTimeout to avoid racing with the toggle button's click event
    const timerId = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timerId);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen, onClose]);

  // Close on Escape and trap focus
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Simple focus trap
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Filter messages by search query (case-insensitive)
  const filteredMessages = useMemo(() => {
    const visible = messages.filter((m) => m.text.length > 0);
    if (!searchQuery.trim()) return visible;
    const lower = searchQuery.toLowerCase();
    return visible.filter((m) => m.text.toLowerCase().includes(lower));
  }, [messages, searchQuery]);

  // Scroll to bottom only when NOT searching (search results should stay scrolled up)
  useEffect(() => {
    if (isOpen && !searchQuery && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [filteredMessages, isOpen, searchQuery]);

  if (!isOpen) return null;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const matchCount = searchQuery.trim()
    ? filteredMessages.length
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Conversation history"
        className="relative z-10 w-full max-w-lg mx-4 mb-4 sm:mb-0 bg-gray-900/95 backdrop-blur-md rounded-2xl border border-gray-700/50 shadow-2xl animate-in slide-in-from-bottom-4 duration-300 max-h-[70vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700/50 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Conversation</h2>
            <div className="flex items-center gap-2">
              {onClear && messages.length > 0 && (
                <button
                  onClick={onClear}
                  className="p-1.5 rounded-lg hover:bg-red-700/40 transition-colors text-gray-400 hover:text-red-300"
                  aria-label="Clear conversation history"
                  title="Clear history"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-700/60 transition-colors"
                aria-label="Close conversation history"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Search bar */}
          {messages.length > 0 && (
            <div className="relative">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages…"
                className="w-full bg-gray-800/60 text-white text-sm placeholder-gray-500 rounded-lg pl-9 pr-8 py-2 outline-none border border-gray-700/40 focus:border-purple-500/50 transition-colors"
                aria-label="Search conversation messages"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-700/60 transition-colors text-gray-400 hover:text-white"
                  aria-label="Clear search"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Match count indicator */}
          {matchCount !== null && (
            <p className="text-xs text-gray-400">
              {matchCount === 0
                ? 'No matches found'
                : `${matchCount} message${matchCount === 1 ? '' : 's'} found`}
            </p>
          )}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-4">
            {messages.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-8">
                No messages yet. Click the blob to start talking.
              </p>
            )}
            {searchQuery.trim() && filteredMessages.length === 0 && messages.length > 0 && (
              <p className="text-center text-gray-500 text-sm py-8">
                No messages match &ldquo;{searchQuery}&rdquo;
              </p>
            )}
            {filteredMessages.map((msg, i) => (
              <div
                key={`${msg.timestamp}-${msg.role}-${i}`}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-purple-600/80 text-white rounded-br-md'
                      : 'bg-gray-700/60 text-gray-100 rounded-bl-md'
                  }`}
                >
                  <p className="whitespace-pre-wrap">
                    <HighlightedText text={msg.text} query={searchQuery} />
                  </p>
                  <span
                    className={`block text-[10px] mt-1 ${
                      msg.role === 'user' ? 'text-purple-200/60' : 'text-gray-400/60'
                    }`}
                  >
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default ConversationHistory;
