"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/use-socket";
import type { User } from "@/lib/types";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatWindow } from "@/components/chat/chat-window";
import { ChatEmpty } from "@/components/chat/chat-empty";

export default function ChatPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const state = useSocket();

  useEffect(() => {
    const stored = sessionStorage.getItem("whatsapp-user");
    if (!stored) {
      router.push("/login");
      return;
    }
    const user: User = JSON.parse(stored);
    state.setCurrentUser(user);
    state.joinServer(user);
    setHydrated(true);
  }, []);

  if (!hydrated || !state.currentUser) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#00a884]">
        <div className="animate-pulse text-white text-lg">Connecting...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#00a884] p-0 sm:p-4">
      <div className="w-full h-full sm:h-[calc(100vh-2rem)] sm:max-w-[1400px] sm:rounded-sm flex overflow-hidden shadow-xl bg-neutral-50">
        <ChatSidebar
          currentUser={state.currentUser}
          groups={state.groups}
          currentGroupId={state.currentGroupId}
          activeUsers={state.activeUsers}
          onSelectGroup={state.setCurrentGroupId}
          onCreateGroup={state.createGroup}
        />
        {state.currentGroupId ? (
          <ChatWindow
            currentUser={state.currentUser}
            currentGroupId={state.currentGroupId}
            groups={state.groups}
            messages={state.messages}
            typingUsers={state.typingUsers}
            onSendMessage={state.sendMessage}
            onTyping={state.emitTyping}
            onStopTyping={state.emitStopTyping}
          />
        ) : (
          <ChatEmpty />
        )}
      </div>
    </div>
  );
}
