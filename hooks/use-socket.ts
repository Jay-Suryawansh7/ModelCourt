"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import type { User, ChatGroup, Message, TypingUser } from "@/lib/types";

interface UseSocketReturn {
  connected: boolean;
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
  activeUsers: User[];
  groups: ChatGroup[];
  currentGroupId: string | null;
  setCurrentGroupId: (id: string | null) => void;
  messages: Message[];
  typingUsers: TypingUser[];
  joinServer: (user: User) => void;
  createGroup: (name: string) => void;
  joinGroup: (groupId: string, userId: string) => void;
  leaveGroup: (groupId: string) => void;
  sendMessage: (content: string) => void;
  emitTyping: () => void;
  emitStopTyping: () => void;
  loadGroupHistory: (groupId: string) => void;
}

const TYPING_TIMEOUT = 3000;

export function useSocket(): UseSocketReturn {
  const supabase = useRef(createClient()).current;
  const [connected, setConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const currentUserRef = useRef<User | null>(null);
  const typingTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  currentUserRef.current = currentUser;

  // Load groups from Supabase
  const loadGroups = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("group_members")
      .select("group_id, chat_groups(id, name, created_by)")
      .eq("user_id", userId);

    if (data) {
      const mapped: ChatGroup[] = data
        .filter((gm: any) => gm.chat_groups)
        .map((gm: any) => ({
          id: gm.group_id,
          name: gm.chat_groups.name,
          createdBy: gm.chat_groups.created_by,
        }));
      setGroups(mapped);
    }
  }, [supabase]);

  // Subscribe to a group channel
  const subscribeToGroup = useCallback((groupId: string, userId: string) => {
    if (channelsRef.current.has(groupId)) return;

    const channel = supabase.channel(`group:${groupId}`);

    // Listen for new messages via Postgres Changes
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `group_id=eq.${groupId}`,
      },
      (payload: any) => {
        const newMsg = payload.new;
        const msg: Message = {
          id: newMsg.id,
          groupId: newMsg.group_id,
          userId: newMsg.user_id,
          content: newMsg.content,
          name: newMsg.name || "",
          avatar: newMsg.avatar || "",
          type: newMsg.type || "text",
          createdAt: new Date(newMsg.created_at).getTime(),
        };
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    );

    // Listen for typing broadcast
    channel.on("broadcast", { event: "typing" }, (payload: any) => {
      const data = payload.payload as TypingUser;
      if (data.userId === userId) return;
      setTypingUsers((prev) => {
        if (prev.find((t) => t.userId === data.userId)) return prev;
        return [...prev, data];
      });
      // Auto-clear after timeout
      const timer = typingTimersRef.current.get(data.userId);
      if (timer) clearTimeout(timer);
      typingTimersRef.current.set(
        data.userId,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((t) => t.userId !== data.userId));
        }, TYPING_TIMEOUT)
      );
    });

    // Listen for stop typing
    channel.on("broadcast", { event: "stop-typing" }, (payload: any) => {
      const { userId: typingUserId } = payload.payload;
      setTypingUsers((prev) => prev.filter((t) => t.userId !== typingUserId));
      const timer = typingTimersRef.current.get(typingUserId);
      if (timer) clearTimeout(timer);
    });

    // Presence for online users in this group
    channel.on("presence", { event: "sync" }, () => {
      const presenceState = channel.presenceState();
      const users: User[] = [];
      Object.values(presenceState).forEach((presences: any) => {
        presences.forEach((p: any) => {
          if (p.userId !== userId) {
            users.push({ id: p.userId, name: p.name, avatar: p.avatar, status: "online" });
          }
        });
      });
      setActiveUsers(users);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        // Track presence
        await channel.track({
          userId,
          name: currentUserRef.current?.name || "Unknown",
          avatar: currentUserRef.current?.avatar || "",
          online_at: new Date().toISOString(),
        });
      }
    });

    channelsRef.current.set(groupId, channel);
  }, [supabase]);

  // Unsubscribe from a group
  const unsubscribeFromGroup = useCallback((groupId: string) => {
    const channel = channelsRef.current.get(groupId);
    if (channel) {
      supabase.removeChannel(channel);
      channelsRef.current.delete(groupId);
    }
  }, [supabase]);

  // Join server - set up initial state
  const joinServer = useCallback(async (user: User) => {
    setCurrentUser(user);

    // Ensure user exists in Supabase
    await supabase.from("users").upsert({
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      status: "online",
    });

    // Load existing groups
    await loadGroups(user.id);

    // Subscribe to a global channel for group creation broadcasts
    const globalChannel = supabase.channel("global");
    globalChannel.on("broadcast", { event: "group-created" }, (payload: any) => {
      const newGroup = payload.payload as ChatGroup;
      setGroups((prev) => {
        if (prev.find((g) => g.id === newGroup.id)) return prev;
        return [...prev, newGroup];
      });
    });
    globalChannel.subscribe();
    channelsRef.current.set("global", globalChannel);
  }, [supabase, loadGroups]);

  // Subscribe to all groups when they load
  useEffect(() => {
    if (!currentUser) return;
    groups.forEach((g) => {
      subscribeToGroup(g.id, currentUser.id);
    });
    return () => {
      groups.forEach((g) => unsubscribeFromGroup(g.id));
    };
  }, [groups, currentUser, subscribeToGroup, unsubscribeFromGroup]);

  // Create a new group
  const createGroup = useCallback(async (name: string) => {
    if (!currentUser) return;
    const groupId = crypto.randomUUID();

    await supabase.from("chat_groups").insert({
      id: groupId,
      name,
      created_by: currentUser.id,
    });

    await supabase.from("group_members").insert({
      group_id: groupId,
      user_id: currentUser.id,
      role: "admin",
    });

    const newGroup: ChatGroup = { id: groupId, name, createdBy: currentUser.id };

    // Broadcast via global channel
    const globalChannel = channelsRef.current.get("global");
    if (globalChannel) {
      await globalChannel.send({
        type: "broadcast",
        event: "group-created",
        payload: newGroup,
      });
    }

    setGroups((prev) => {
      if (prev.find((g) => g.id === groupId)) return prev;
      return [...prev, newGroup];
    });
  }, [currentUser, supabase]);

  // Join a group
  const joinGroup = useCallback(async (groupId: string, userId: string) => {
    await supabase.from("group_members").upsert({
      group_id: groupId,
      user_id: userId,
      role: "member",
    });
    subscribeToGroup(groupId, userId);
  }, [supabase, subscribeToGroup]);

  // Leave a group
  const leaveGroup = useCallback(async (groupId: string) => {
    if (!currentUser) return;
    await supabase.from("group_members").delete().match({
      group_id: groupId,
      user_id: currentUser.id,
    });
    unsubscribeFromGroup(groupId);
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, [currentUser, supabase, unsubscribeFromGroup]);

  // Send a message
  const sendMessage = useCallback(async (content: string) => {
    if (!currentUser || !currentGroupId) return;
    const { error } = await supabase.from("messages").insert({
      group_id: currentGroupId,
      user_id: currentUser.id,
      content,
      name: currentUser.name,
      avatar: currentUser.avatar,
      type: "text",
    });
    if (error) console.error("Error sending message:", error);
  }, [currentUser, currentGroupId, supabase]);

  // Typing indicators - broadcast via channel
  const emitTyping = useCallback(async () => {
    if (!currentUser || !currentGroupId) return;
    const channel = channelsRef.current.get(currentGroupId);
    if (channel) {
      await channel.send({
        type: "broadcast",
        event: "typing",
        payload: { groupId: currentGroupId, userId: currentUser.id, name: currentUser.name },
      });
    }
  }, [currentUser, currentGroupId]);

  const emitStopTyping = useCallback(async () => {
    if (!currentUser || !currentGroupId) return;
    const channel = channelsRef.current.get(currentGroupId);
    if (channel) {
      await channel.send({
        type: "broadcast",
        event: "stop-typing",
        payload: { groupId: currentGroupId, userId: currentUser.id },
      });
    }
  }, [currentUser, currentGroupId]);

  // Load message history for a group
  const loadGroupHistory = useCallback(async (groupId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (data) {
      const mapped: Message[] = data.map((m: any) => ({
        id: m.id,
        groupId: m.group_id,
        userId: m.user_id,
        content: m.content,
        name: m.name || "",
        avatar: m.avatar || "",
        type: m.type || "text",
        createdAt: new Date(m.created_at).getTime(),
      }));
      setMessages(mapped);
    }
  }, [supabase]);

  // Load history when group changes
  useEffect(() => {
    if (currentGroupId) {
      loadGroupHistory(currentGroupId);
      // Subscribe if not already subscribed
      if (currentUser) {
        subscribeToGroup(currentGroupId, currentUser.id);
      }
    } else {
      setMessages([]);
    }
  }, [currentGroupId, loadGroupHistory, currentUser, subscribeToGroup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      channelsRef.current.clear();
      typingTimersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, [supabase]);

  return {
    connected,
    currentUser,
    setCurrentUser,
    activeUsers,
    groups,
    currentGroupId,
    setCurrentGroupId,
    messages,
    typingUsers,
    joinServer,
    createGroup,
    joinGroup,
    leaveGroup,
    sendMessage,
    emitTyping,
    emitStopTyping,
    loadGroupHistory,
  };
}
