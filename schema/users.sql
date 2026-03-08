CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  primary_group_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (primary_group_id) REFERENCES groups(id)
);
