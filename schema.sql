CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  displayName TEXT NOT NULL,
  passwordHash TEXT NOT NULL,
  avatarColor TEXT NOT NULL DEFAULT '#00b894',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  lastSeen TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  isGroup INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  conversationId TEXT NOT NULL REFERENCES conversations(id),
  joinedAt TEXT NOT NULL DEFAULT (datetime('now')),
  lastReadAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, conversationId)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL REFERENCES conversations(id),
  senderId TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId, createdAt);
CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(userId);
CREATE INDEX IF NOT EXISTS idx_participants_conv ON conversation_participants(conversationId);
