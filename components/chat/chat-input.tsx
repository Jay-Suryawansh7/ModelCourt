"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SendHorizonalIcon, SmileIcon, PaperclipIcon } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onTyping: () => void;
  onStopTyping: () => void;
}

export function ChatInput({ onSendMessage, onTyping, onStopTyping }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      setMessage(value);
      if (value.trim()) {
        onTyping();
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          onStopTyping();
        }, 2000);
      } else {
        onStopTyping();
      }
    },
    [onTyping, onStopTyping]
  );

  const handleSend = useCallback(() => {
    if (!message.trim()) return;
    onSendMessage(message.trim());
    setMessage("");
    onStopTyping();
  }, [message, onSendMessage, onStopTyping]);

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-[#f0f2f5]">
      <Button variant="ghost" size="icon" className="size-10 text-neutral-500 hover:text-neutral-700 shrink-0">
        <SmileIcon className="size-6" />
      </Button>
      <Button variant="ghost" size="icon" className="size-10 text-neutral-500 hover:text-neutral-700 shrink-0">
        <PaperclipIcon className="size-6" />
      </Button>
      <input
        type="text"
        placeholder="Type a message"
        value={message}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        className="flex-1 h-10 px-4 rounded-lg bg-white border-none outline-none text-[15px] text-neutral-900 placeholder:text-neutral-400"
      />
      <Button
        onClick={handleSend}
        disabled={!message.trim()}
        variant="ghost"
        size="icon"
        className={`size-10 shrink-0 ${
          message.trim()
            ? "text-[#00a884] hover:text-[#008f6d]"
            : "text-neutral-400"
        }`}
      >
        <SendHorizonalIcon className="size-6" />
      </Button>
    </div>
  );
}
