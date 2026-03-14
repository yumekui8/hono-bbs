import type { User } from '../types'

type UserRow = {
  id: string
  display_name: string
  bio: string | null
  email: string | null
  is_active: number
  password_hash: string
  primary_group_id: string | null
  created_at: string
  updated_at: string
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    displayName: row.display_name,
    bio: row.bio,
    email: row.email,
    isActive: row.is_active === 1,
    primaryGroupId: row.primary_group_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// page: 1始まり、limit: 0なら全件
export async function listUsers(db: D1Database, page = 1, limit = 0): Promise<User[]> {
  if (limit > 0) {
    const offset = (page - 1) * limit
    const result = await db
      .prepare('SELECT * FROM users ORDER BY created_at ASC LIMIT ? OFFSET ?')
      .bind(limit, offset)
      .all<UserRow>()
    return result.results.map(rowToUser)
  }
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

export async function insertUser(
  db: D1Database,
  id: string,
  displayName: string,
  passwordHash: string,
  primaryGroupId: string | null,
  now: string,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO users (id, display_name, bio, email, is_active, password_hash, primary_group_id, created_at, updated_at) VALUES (?, ?, NULL, NULL, 1, ?, ?, ?, ?)',
    )
    .bind(id, displayName, passwordHash, primaryGroupId, now, now)
    .run()
}

export type UpdateUserFields = {
  displayName?: string
  bio?: string | null
  email?: string | null
  isActive?: boolean
  passwordHash?: string
  updatedAt: string
}

export async function updateUser(
  db: D1Database,
  id: string,
  fields: UpdateUserFields,
): Promise<boolean> {
  const sets: string[] = []
  const values: (string | number | null)[] = []

  if (fields.displayName !== undefined) {
    sets.push('display_name = ?')
    values.push(fields.displayName)
  }
  if (fields.bio !== undefined) {
    sets.push('bio = ?')
    values.push(fields.bio)
  }
  if (fields.email !== undefined) {
    sets.push('email = ?')
    values.push(fields.email)
  }
  if (fields.isActive !== undefined) {
    sets.push('is_active = ?')
    values.push(fields.isActive ? 1 : 0)
  }
  if (fields.passwordHash !== undefined) {
    sets.push('password_hash = ?')
    values.push(fields.passwordHash)
  }
  sets.push('updated_at = ?')
  values.push(fields.updatedAt)
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
  updatedAt: string,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(passwordHash, updatedAt, id)
    .run()
  return result.meta.changes > 0
}

export async function deleteUser(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  return result.meta.changes > 0
}
