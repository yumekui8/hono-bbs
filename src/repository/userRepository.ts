import type { User } from '../types'

type UserRow = {
  id: string
  username: string
  password_hash: string
  primary_group_id: string | null
  created_at: string
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    primaryGroupId: row.primary_group_id,
    createdAt: row.created_at,
  }
}

export async function listUsers(db: D1Database): Promise<User[]> {
  const result = await db.prepare('SELECT * FROM users ORDER BY created_at ASC').all<UserRow>()
  return result.results.map(rowToUser)
}

export async function findUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>()
  return row ? rowToUser(row) : null
}

export async function findUserByIdWithHash(
  db: D1Database,
  id: string,
): Promise<{ user: User; passwordHash: string } | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>()
  if (!row) return null
  return { user: rowToUser(row), passwordHash: row.password_hash }
}

export async function findUserByUsername(db: D1Database, username: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE username = ?')
    .bind(username)
    .first<UserRow>()
  return row ? rowToUser(row) : null
}

export async function findUserWithHash(
  db: D1Database,
  username: string,
): Promise<{ user: User; passwordHash: string } | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE username = ?')
    .bind(username)
    .first<UserRow>()
  if (!row) return null
  return { user: rowToUser(row), passwordHash: row.password_hash }
}

export async function insertUser(
  db: D1Database,
  id: string,
  username: string,
  passwordHash: string,
  primaryGroupId: string | null,
  createdAt: string,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO users (id, username, password_hash, primary_group_id, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(id, username, passwordHash, primaryGroupId, createdAt)
    .run()
}

export async function updateUser(
  db: D1Database,
  id: string,
  fields: { username?: string; primaryGroupId?: string | null },
): Promise<boolean> {
  if (!fields.username && fields.primaryGroupId === undefined) return false
  const sets: string[] = []
  const values: (string | null)[] = []
  if (fields.username) {
    sets.push('username = ?')
    values.push(fields.username)
  }
  if (fields.primaryGroupId !== undefined) {
    sets.push('primary_group_id = ?')
    values.push(fields.primaryGroupId)
  }
  values.push(id)
  const result = await db
    .prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()
  return result.meta.changes > 0
}

export async function updateUserPassword(
  db: D1Database,
  id: string,
  passwordHash: string,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(passwordHash, id)
    .run()
  return result.meta.changes > 0
}

export async function deleteUser(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  return result.meta.changes > 0
}
