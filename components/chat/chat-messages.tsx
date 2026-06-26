"use client";

import { useEffect, useRef } from "react";
import type { User, Message, TypingUser } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatMessagesProps {
  currentUser: User;
  messages: Message[];
  typingUsers: TypingUser[];
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatMessages({ currentUser, messages, typingUsers }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-16 py-4 bg-[#efeae2] bg-[url('/whatsapp-bg.png')] bg-repeat">
      {/* WhatsApp-style doodle background (fallback) */}
      <div className="max-w-[900px] mx-auto flex flex-col gap-1">
        {messages.map((msg) => {
          const isOwn = msg.userId === currentUser.id;

          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-0.5`}
            >
              {!isOwn && (
                <Avatar className="size-8 mt-auto mr-2 shrink-0">
                  <AvatarImage src={msg.avatar} />
                  <AvatarFallback className="bg-neutral-400 text-white text-xs">
                    {(msg.name || "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`max-w-[65%] rounded-lg px-3 py-2 shadow-sm ${
                  isOwn
                    ? "bg-[#d9fdd3] rounded-tr-none"
                    : "bg-white rounded-tl-none"
                }`}
              >
                {!isOwn && msg.name && (
                  <p className="text-xs font-medium text-[#00a884] mb-0.5">
                    {msg.name}
                  </p>
                )}
                <p className="text-[14.2px] text-neutral-900 whitespace-pre-wrap break-words leading-[19px]">
                  {msg.content}
                </p>
                <p className="text-[11px] text-neutral-500 text-right mt-0.5 flex items-center justify-end gap-1">
                  {formatTime(msg.createdAt)}
                  {isOwn && (
                    <svg viewBox="0 0 16 11" className="size-4 text-[#53bdeb] fill-current">
                      <path d="M11.071.653a.457.457 0 00-.304-.102.493.493 0 00-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 00-.336-.153.457.457 0 00-.342.147.51.51 0 00-.147.381.463.463 0 00.147.342l2.295 2.295a.51.51 0 00.381.147.612.612 0 00.381-.178l6.49-7.88a.457.457 0 00.108-.342.463.463 0 00-.108-.381zm-2.776 7.636l-1.135 1.381 2.295 2.295a.51.51 0 00.381.147.612.612 0 00.381-.178l6.49-7.88a.457.457 0 00.108-.342.463.463 0 00-.414-.476.493.493 0 00-.381.178z" />
                    </svg>
                  )}
                </p>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex justify-start mb-0.5">
            <div className="bg-white rounded-lg rounded-tl-none px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="size-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="size-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="size-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
