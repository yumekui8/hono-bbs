import type { Group } from '../types'

type GroupRow = { id: string; name: string; created_at: string }

function rowToGroup(row: GroupRow): Group {
  return { id: row.id, name: row.name, createdAt: row.created_at }
}

// page: 1始まり、limit: 0なら全件
export async function listGroups(db: D1Database, page = 1, limit = 0): Promise<Group[]> {
  if (limit > 0) {
    const offset = (page - 1) * limit
    const result = await db
      .prepare('SELECT * FROM groups ORDER BY created_at ASC LIMIT ? OFFSET ?')
      .bind(limit, offset)
      .all<GroupRow>()
    return result.results.map(rowToGroup)
  }
  const result = await db.prepare('SELECT * FROM groups ORDER BY created_at ASC').all<GroupRow>()
  return result.results.map(rowToGroup)
}

export async function findGroupById(db: D1Database, id: string): Promise<Group | null> {
  const row = await db.prepare('SELECT * FROM groups WHERE id = ?').bind(id).first<GroupRow>()
  return row ? rowToGroup(row) : null
}

export async function findGroupByName(db: D1Database, name: string): Promise<Group | null> {
  const row = await db.prepare('SELECT * FROM groups WHERE name = ?').bind(name).first<GroupRow>()
  return row ? rowToGroup(row) : null
}

export async function findGroupsByUserId(db: D1Database, userId: string): Promise<Group[]> {
  const result = await db
    .prepare(
      'SELECT g.* FROM groups g INNER JOIN user_groups ug ON g.id = ug.group_id WHERE ug.user_id = ?',
    )
    .bind(userId)
    .all<GroupRow>()
  return result.results.map(rowToGroup)
}

export async function findGroupIdsByUserId(db: D1Database, userId: string): Promise<string[]> {
  const result = await db
    .prepare('SELECT group_id FROM user_groups WHERE user_id = ?')
    .bind(userId)
    .all<{ group_id: string }>()
  return result.results.map((r) => r.group_id)
}

export async function insertGroup(db: D1Database, group: Group): Promise<void> {
  await db
    .prepare('INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)')
    .bind(group.id, group.name, group.createdAt)
    .run()
}

export async function updateGroup(
  db: D1Database,
  id: string,
  name: string,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE groups SET name = ? WHERE id = ?')
    .bind(name, id)
    .run()
  return result.meta.changes > 0
}

export async function deleteGroup(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM groups WHERE id = ?').bind(id).run()
  return result.meta.changes > 0
}

export async function insertUserGroup(
  db: D1Database,
  userId: string,
  groupId: string,
): Promise<void> {
  // OR IGNORE で重複を無視する
  await db
    .prepare('INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)')
    .bind(userId, groupId)
    .run()
}

export async function deleteUserGroup(
  db: D1Database,
  userId: string,
  groupId: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM user_groups WHERE user_id = ? AND group_id = ?')
    .bind(userId, groupId)
    .run()
  return result.meta.changes > 0
}
