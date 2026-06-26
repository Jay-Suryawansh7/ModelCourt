import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import type { User, ChatGroup, Message, TypingUser } from "@/lib/types";
import { AGENTS, AGENT_IDS } from "@/lib/agents";

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

  const loadGroups = useCallback(async (userId: string) => {
    try {
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
    } catch (e) {
      console.warn("loadGroups: tables not ready yet", e);
    }
  }, [supabase]);

  // Subscribe to a group channel for real-time messages via Broadcast
  const subscribeToGroup = useCallback((groupId: string, userId: string) => {
    if (channelsRef.current.has(groupId)) return;

    const channel = supabase.channel(`group:${groupId}`);

    // Listen for new messages via Broadcast (free, no replication needed)
    channel.on("broadcast", { event: "new-message" }, (payload: any) => {
      const msg = payload.payload as Message;
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    // Listen for typing events
    channel.on("broadcast", { event: "typing" }, (payload: any) => {
      const data = payload.payload as TypingUser;
      if (data.userId === userId) return;
      setTypingUsers((prev) => {
        if (prev.find((t) => t.userId === data.userId)) return prev;
        return [...prev, data];
      });
      const timer = typingTimersRef.current.get(data.userId);
      if (timer) clearTimeout(timer);
      typingTimersRef.current.set(
        data.userId,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((t) => t.userId !== data.userId));
        }, TYPING_TIMEOUT)
      );
    });

    channel.on("broadcast", { event: "stop-typing" }, (payload: any) => {
      const { userId: typingUserId } = payload.payload;
      setTypingUsers((prev) => prev.filter((t) => t.userId !== typingUserId));
      const timer = typingTimersRef.current.get(typingUserId);
      if (timer) clearTimeout(timer);
    });

    // Presence for online users
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

    try {
      await supabase.from("users").upsert({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        status: "online",
      });
    } catch (e) {
      console.warn("joinServer: users table not ready yet", e);
    }

    await loadGroups(user.id);

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

    try {
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

      for (const agentId of AGENT_IDS) {
        await supabase.from("group_members").insert({
          group_id: groupId,
          user_id: agentId,
          role: "member",
        });
      }
    } catch (e) {
      console.warn("createGroup: tables not ready", e);
      return;
    }

    const newGroup: ChatGroup = { id: groupId, name, createdBy: currentUser.id };

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

  const joinGroup = useCallback(async (groupId: string, userId: string) => {
    await supabase.from("group_members").upsert({
      group_id: groupId,
      user_id: userId,
      role: "member",
    });
    subscribeToGroup(groupId, userId);
  }, [supabase, subscribeToGroup]);

  const leaveGroup = useCallback(async (groupId: string) => {
    if (!currentUser) return;
    await supabase.from("group_members").delete().match({
      group_id: groupId,
      user_id: currentUser.id,
    });
    unsubscribeFromGroup(groupId);
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, [currentUser, supabase, unsubscribeFromGroup]);

  // Broadcast a message on the group channel
  const broadcastMessage = useCallback(async (msg: Message) => {
    const channel = channelsRef.current.get(msg.groupId);
    if (channel) {
      await channel.send({
        type: "broadcast",
        event: "new-message",
        payload: msg,
      });
    }
  }, []);

  // Send a message: insert to DB + broadcast via Realtime + trigger AI
  const sendMessage = useCallback(async (content: string) => {
    if (!currentUser || !currentGroupId) return;

    let messageId: string | null = null;
    try {
      const { data, error } = await supabase.from("messages").insert({
        group_id: currentGroupId,
        user_id: currentUser.id,
        content,
        name: currentUser.name,
        avatar: currentUser.avatar,
        type: "text",
      }).select("id").single();

      if (error) {
        console.error("Error sending message:", error);
        return;
      }
      messageId = data?.id || null;
    } catch (e) {
      console.warn("sendMessage: messages table not ready", e);
    }

    // Build the message object and broadcast
    const tempMsg: Message = {
      id: messageId || crypto.randomUUID(),
      groupId: currentGroupId,
      userId: currentUser.id,
      content,
      name: currentUser.name,
      avatar: currentUser.avatar,
      type: "text",
      createdAt: Date.now(),
    };

    await broadcastMessage(tempMsg);

    // Trigger AI responses
    if (messageId) {
      fetch("/api/chat/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: currentGroupId, messageId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.responses) {
            // Broadcast each AI response on the group channel
            data.responses.forEach((r: any, idx: number) => {
              setTimeout(() => {
                const agent = AGENTS.find((a) => a.name === r.name);
                if (!agent) return;
                const aiMsg: Message = {
                  id: crypto.randomUUID(),
                  groupId: currentGroupId,
                  userId: agent.id,
                  content: r.content,
                  name: agent.name,
                  avatar: agent.avatar,
                  type: "text",
                  createdAt: Date.now() + idx * 2000,
                };
                broadcastMessage(aiMsg);
              }, idx * 2000);
            });
          }
        })
        .catch((err) => console.error("AI respond error:", err));
    }
  }, [currentUser, currentGroupId, supabase, broadcastMessage]);

  // Typing indicators
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

  // Load message history from Supabase (for page load / refresh)
  const loadGroupHistory = useCallback(async (groupId: string) => {
    try {
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
    } catch (e) {
      console.warn("loadGroupHistory: messages table not ready", e);
    }
  }, [supabase]);

  useEffect(() => {
    if (currentGroupId) {
      loadGroupHistory(currentGroupId);
      if (currentUser) {
        subscribeToGroup(currentGroupId, currentUser.id);
      }
    } else {
      setMessages([]);
    }
  }, [currentGroupId, loadGroupHistory, currentUser, subscribeToGroup]);

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
