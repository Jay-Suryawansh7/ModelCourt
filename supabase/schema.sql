-- Supabase SQL Schema for WhatsApp Clone
-- Run this in your Supabase SQL Editor

-- 1. Create tables
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  status TEXT DEFAULT 'online',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  is_private BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  name TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  content TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index for fast message retrieval
CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id, created_at);

-- 3. Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies (allow all for demo)
CREATE POLICY "Allow all on users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on chat_groups" ON chat_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on group_members" ON group_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on messages" ON messages FOR ALL USING (true) WITH CHECK (true);

-- 5. Seed AI agent users
INSERT INTO users (id, name, avatar) VALUES
  ('agent-cmo', 'Sarah', 'https://api.dicebear.com/9.x/avataaars/svg?seed=sarah-cmo'),
  ('agent-cfo', 'Marcus', 'https://api.dicebear.com/9.x/avataaars/svg?seed=marcus-cfo'),
  ('agent-pm', 'Alex', 'https://api.dicebear.com/9.x/avataaars/svg?seed=alex-pm'),
  ('agent-project-manager', 'Jordan', 'https://api.dicebear.com/9.x/avataaars/svg?seed=jordan-pm'),
  ('agent-analyst', 'Riley', 'https://api.dicebear.com/9.x/avataaars/svg?seed=riley-analyst'),
  ('agent-architect', 'Dev', 'https://api.dicebear.com/9.x/avataaars/svg?seed=dev-architect')
ON CONFLICT (id) DO NOTHING;

-- 6. Realtime is handled via Broadcast (free) — no replication needed.
-- Messages are broadcast on group channels: `group:<group_id>`
