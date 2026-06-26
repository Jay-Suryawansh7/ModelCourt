"use client";

import type { User, ChatGroup, Message, TypingUser } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface ChatWindowProps {
  currentUser: User;
  currentGroupId: string;
  groups: ChatGroup[];
  messages: Message[];
  typingUsers: TypingUser[];
  onSendMessage: (content: string) => void;
  onTyping: () => void;
  onStopTyping: () => void;
}

export function ChatWindow({
  currentUser,
  currentGroupId,
  groups,
  messages,
  typingUsers,
  onSendMessage,
  onTyping,
  onStopTyping,
}: ChatWindowProps) {
  const group = groups.find((g) => g.id === currentGroupId);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const groupTyping = typingUsers.filter((t) => t.groupId === currentGroupId);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#efeae2]">
      {/* Chat Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#f0f2f5] border-b border-neutral-200">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 sm:hidden text-neutral-500"
          onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        >
          <ArrowLeftIcon className="size-5" />
        </Button>
        <Avatar className="size-10">
          <AvatarFallback className="bg-[#00a884] text-white text-sm font-medium">
            {group?.name?.charAt(0).toUpperCase() || "G"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="font-medium text-neutral-900 text-[15px] truncate">
            {group?.name || "Chat"}
          </h2>
          <p className="text-xs text-neutral-500">
            {groupTyping.length > 0
              ? `${groupTyping.map((t) => t.name).join(", ")} typing...`
              : "Group chat"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <ChatMessages
        currentUser={currentUser}
        messages={messages}
        typingUsers={groupTyping}
      />

      {/* Input */}
      <ChatInput
        onSendMessage={onSendMessage}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
      />
    </div>
  );
}
