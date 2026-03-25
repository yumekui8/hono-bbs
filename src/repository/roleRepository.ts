import type { Role } from '../types'
import type { DbAdapter } from '../adapters/db'

type RoleRow = { id: string; name: string; created_at: string }

function rowToRole(row: RoleRow): Role {
  return { id: row.id, name: row.name, createdAt: row.created_at }
}

// page: 1始まり、limit: 0なら全件
export async function listRoles(db: DbAdapter, page = 1, limit = 0): Promise<Role[]> {
  if (limit > 0) {
    const offset = (page - 1) * limit
    const result = await db.all<RoleRow>(
      'SELECT * FROM roles ORDER BY created_at ASC LIMIT ? OFFSET ?',
      [limit, offset],
    )
    return result.results.map(rowToRole)
  }
  const result = await db.all<RoleRow>('SELECT * FROM roles ORDER BY created_at ASC')
  return result.results.map(rowToRole)
}

export async function findRoleById(db: DbAdapter, id: string): Promise<Role | null> {
  const row = await db.first<RoleRow>('SELECT * FROM roles WHERE id = ?', [id])
  return row ? rowToRole(row) : null
}

export async function findRoleByName(db: DbAdapter, name: string): Promise<Role | null> {
  const row = await db.first<RoleRow>('SELECT * FROM roles WHERE name = ?', [name])
  return row ? rowToRole(row) : null
}

export async function findRoleIdsByUserId(db: DbAdapter, userId: string): Promise<string[]> {
  const result = await db.all<{ role_id: string }>(
    'SELECT role_id FROM user_roles WHERE user_id = ?',
    [userId],
  )
  return result.results.map((r) => r.role_id)
}

export async function insertRole(db: DbAdapter, role: Role): Promise<void> {
  await db.run(
    'INSERT INTO roles (id, name, created_at) VALUES (?, ?, ?)',
    [role.id, role.name, role.createdAt],
  )
}

export async function updateRole(db: DbAdapter, id: string, name: string): Promise<boolean> {
  const result = await db.run(
    'UPDATE roles SET name = ? WHERE id = ?',
    [name, id],
  )
  return result.changes > 0
}

export async function deleteRole(db: DbAdapter, id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM roles WHERE id = ?', [id])
  return result.changes > 0
}

export async function insertUserRole(db: DbAdapter, userId: string, roleId: string): Promise<void> {
  // OR IGNORE で重複を無視する
  await db.run(
    'INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
    [userId, roleId],
  )
}

export async function deleteUserRole(db: DbAdapter, userId: string, roleId: string): Promise<boolean> {
  const result = await db.run(
    'DELETE FROM user_roles WHERE user_id = ? AND role_id = ?',
    [userId, roleId],
  )
  return result.changes > 0
}
