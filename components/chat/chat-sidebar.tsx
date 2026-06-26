"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { User, ChatGroup } from "@/lib/types";
import { SearchIcon, PlusIcon, MessageCircleIcon } from "lucide-react";
import { useState } from "react";

interface ChatSidebarProps {
  currentUser: User;
  groups: ChatGroup[];
  currentGroupId: string | null;
  activeUsers: User[];
  onSelectGroup: (id: string | null) => void;
  onCreateGroup: (name: string) => void;
}

export function ChatSidebar({
  currentUser,
  groups,
  currentGroupId,
  activeUsers,
  onSelectGroup,
  onCreateGroup,
}: ChatSidebarProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    onCreateGroup(newGroupName.trim());
    setNewGroupName("");
    setShowNewGroup(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("whatsapp-user");
    router.push("/login");
  };

  return (
    <div className="w-full sm:w-[380px] flex flex-col border-r border-neutral-200 bg-white h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#f0f2f5]">
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarImage src={currentUser.avatar} />
            <AvatarFallback className="bg-[#00a884] text-white text-sm">
              {currentUser.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-neutral-900 text-sm">{currentUser.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-neutral-500 hover:text-neutral-700"
            onClick={() => setShowNewGroup(!showNewGroup)}
          >
            <PlusIcon className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-neutral-500 hover:text-neutral-700"
            onClick={handleLogout}
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current strokeWidth-2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        </div>
      </div>

      {/* New Group Form */}
      {showNewGroup && (
        <div className="flex items-center gap-2 px-4 py-3 bg-[#f0f2f5] border-b border-neutral-200">
          <Input
            placeholder="Group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
            className="h-9 text-sm flex-1"
          />
          <Button
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim()}
            size="sm"
            className="bg-[#00a884] hover:bg-[#008f6d] text-white"
          >
            Create
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 bg-white">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
          <Input
            placeholder="Search or start new chat"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 text-sm bg-[#f0f2f5] border-none rounded-lg"
          />
        </div>
      </div>

      {/* Online Users Indicator */}
      {activeUsers.length > 1 && (
        <div className="px-4 py-1.5 text-xs text-[#00a884] font-medium">
          {activeUsers.length} users online
        </div>
      )}

      <Separator />

      {/* Group List */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
              <MessageCircleIcon className="size-10 mb-2" />
              <p className="text-sm">No groups yet</p>
              <p className="text-xs">Create one to start chatting</p>
            </div>
          )}
          {filtered.map((group) => (
            <button
              key={group.id}
              onClick={() => onSelectGroup(group.id)}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-[#f0f2f5] transition-colors text-left w-full ${
                currentGroupId === group.id ? "bg-[#f0f2f5]" : ""
              }`}
            >
              <Avatar className="size-12">
                <AvatarFallback className="bg-[#00a884] text-white font-medium">
                  {group.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-900 text-[15px] truncate">
                    {group.name}
                  </span>
                </div>
                <p className="text-sm text-neutral-500 truncate">Group chat</p>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
