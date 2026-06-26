export interface User {
  id: string;
  name: string;
  avatar: string;
  status?: 'online' | 'offline';
}

export interface ChatGroup {
  id: string;
  name: string;
  createdBy: string;
  members?: GroupMember[];
}

export interface GroupMember {
  userId: string;
  socketId?: string;
  name?: string;
  avatar?: string;
}

export interface Message {
  id: string;
  groupId: string;
  userId: string;
  content: string;
  name: string;
  avatar: string;
  type: string;
  createdAt: number;
}

export interface TypingUser {
  groupId: string;
  userId: string;
  name: string;
}
