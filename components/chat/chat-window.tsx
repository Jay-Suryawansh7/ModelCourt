"use client";

import type { User, ChatGroup, Message, TypingUser } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { AGENTS } from "@/lib/agents";
import { createClient } from "@/lib/supabase/client";

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
  const [teamMembers, setTeamMembers] = useState<{ name: string; role: string; emoji: string }[]>([]);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  useEffect(() => {
    if (!currentGroupId) return;
    const supabase = createClient();
    supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", currentGroupId)
      .then(({ data }) => {
        if (!data) return;
        const agents = data
          .map((m: any) => AGENTS.find((a) => a.id === m.user_id))
          .filter(Boolean) as typeof AGENTS;
        setTeamMembers(
          agents.map((a) => ({ name: a.name, role: a.role, emoji: a.emoji }))
        );
      });
  }, [currentGroupId]);

  const groupTyping = typingUsers.filter((t) => t.groupId === currentGroupId);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#efeae2]">
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
          <AvatarFallback className="bg-[#075e54] text-white text-sm font-medium">
            {group?.name?.charAt(0).toUpperCase() || "G"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="font-medium text-neutral-900 text-[15px] truncate">
            {group?.name || "Chat"}
          </h2>
          <p className="text-xs text-neutral-500 truncate">
            {groupTyping.length > 0
              ? `${groupTyping.map((t) => t.name).join(", ")} typing...`
              : teamMembers.length > 0
                ? `You + ${teamMembers.map((m) => m.emoji + m.name).join(", ")}`
                : "Group chat"}
          </p>
        </div>
      </div>

      <ChatMessages
        currentUser={currentUser}
        messages={messages}
        typingUsers={groupTyping}
      />

      <ChatInput
        onSendMessage={onSendMessage}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
      />
    </div>
  );
}
