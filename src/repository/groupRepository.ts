import type { Group } from '../types'
import type { DbAdapter } from '../adapters/db'

type GroupRow = { id: string; name: string; created_at: string }

function rowToGroup(row: GroupRow): Group {
  return { id: row.id, name: row.name, createdAt: row.created_at }
}

// page: 1始まり、limit: 0なら全件
export async function listGroups(db: DbAdapter, page = 1, limit = 0): Promise<Group[]> {
  if (limit > 0) {
    const offset = (page - 1) * limit
    const result = await db.all<GroupRow>(
      'SELECT * FROM groups ORDER BY created_at ASC LIMIT ? OFFSET ?',
      [limit, offset],
    )
    return result.results.map(rowToGroup)
  }
  const result = await db.all<GroupRow>('SELECT * FROM groups ORDER BY created_at ASC')
  return result.results.map(rowToGroup)
}

export async function findGroupById(db: DbAdapter, id: string): Promise<Group | null> {
  const row = await db.first<GroupRow>('SELECT * FROM groups WHERE id = ?', [id])
  return row ? rowToGroup(row) : null
}

export async function findGroupByName(db: DbAdapter, name: string): Promise<Group | null> {
  const row = await db.first<GroupRow>('SELECT * FROM groups WHERE name = ?', [name])
  return row ? rowToGroup(row) : null
}

export async function findGroupsByUserId(db: DbAdapter, userId: string): Promise<Group[]> {
  const result = await db.all<GroupRow>(
    'SELECT g.* FROM groups g INNER JOIN user_groups ug ON g.id = ug.group_id WHERE ug.user_id = ?',
    [userId],
  )
  return result.results.map(rowToGroup)
}

export async function findGroupIdsByUserId(db: DbAdapter, userId: string): Promise<string[]> {
  const result = await db.all<{ group_id: string }>(
    'SELECT group_id FROM user_groups WHERE user_id = ?',
    [userId],
  )
  return result.results.map((r) => r.group_id)
}

export async function insertGroup(db: DbAdapter, group: Group): Promise<void> {
  await db.run(
    'INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)',
    [group.id, group.name, group.createdAt],
  )
}

export async function updateGroup(
  db: DbAdapter,
  id: string,
  name: string,
): Promise<boolean> {
  const result = await db.run(
    'UPDATE groups SET name = ? WHERE id = ?',
    [name, id],
  )
  return result.changes > 0
}

export async function deleteGroup(db: DbAdapter, id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM groups WHERE id = ?', [id])
  return result.changes > 0
}

export async function insertUserGroup(
  db: DbAdapter,
  userId: string,
  groupId: string,
): Promise<void> {
  // OR IGNORE で重複を無視する
  await db.run(
    'INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)',
    [userId, groupId],
  )
}

export async function deleteUserGroup(
  db: DbAdapter,
  userId: string,
  groupId: string,
): Promise<boolean> {
  const result = await db.run(
    'DELETE FROM user_groups WHERE user_id = ? AND group_id = ?',
    [userId, groupId],
  )
  return result.changes > 0
}
