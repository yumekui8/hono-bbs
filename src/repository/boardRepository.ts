import type { Board } from '../types'
import type { DbAdapter } from '../adapters/db'

type BoardRow = {
  id: string
  owner_user_id: string | null
  owner_group_id: string | null
  permissions: string
  name: string
  description: string | null
  max_threads: number
  max_thread_title_length: number
  default_max_posts: number
  default_max_post_length: number
  default_max_post_lines: number
  default_max_poster_name_length: number
  default_max_poster_sub_info_length: number
  default_max_poster_meta_info_length: number
  default_poster_name: string
  default_id_format: string
  default_thread_owner_user_id: string | null
  default_thread_owner_group_id: string | null
  default_thread_permissions: string
  category: string | null
  created_at: string
  creator_user_id: string | null
  creator_session_id: string | null
  creator_turnstile_session_id: string | null
}

function rowToBoard(row: BoardRow): Board {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerGroupId: row.owner_group_id,
    permissions: row.permissions,
    name: row.name,
    description: row.description,
    maxThreads: row.max_threads,
    maxThreadTitleLength: row.max_thread_title_length,
    defaultMaxPosts: row.default_max_posts,
    defaultMaxPostLength: row.default_max_post_length,
    defaultMaxPostLines: row.default_max_post_lines,
    defaultMaxPosterNameLength: row.default_max_poster_name_length,
    defaultMaxPosterSubInfoLength: row.default_max_poster_sub_info_length,
    defaultMaxPosterMetaInfoLength: row.default_max_poster_meta_info_length,
    defaultPosterName: row.default_poster_name,
    defaultIdFormat: row.default_id_format as Board['defaultIdFormat'],
    defaultThreadOwnerUserId: row.default_thread_owner_user_id,
    defaultThreadOwnerGroupId: row.default_thread_owner_group_id,
    defaultThreadPermissions: row.default_thread_permissions,
    category: row.category,
    createdAt: row.created_at,
    adminMeta: {
      creatorUserId: row.creator_user_id,
      creatorSessionId: row.creator_session_id,
      creatorTurnstileSessionId: row.creator_turnstile_session_id,
    },
  }
}

export async function findBoards(db: DbAdapter): Promise<Board[]> {
  const result = await db.all<BoardRow>('SELECT * FROM boards ORDER BY created_at DESC')
  return result.results.map(rowToBoard)
}

export async function findBoardById(db: DbAdapter, id: string): Promise<Board | null> {
  const row = await db.first<BoardRow>('SELECT * FROM boards WHERE id = ?', [id])
  return row ? rowToBoard(row) : null
}

export async function insertBoard(db: DbAdapter, board: Board): Promise<void> {
  await db.run(
    `
      INSERT INTO boards (
        id, owner_user_id, owner_group_id, permissions, name, description,
        max_threads, max_thread_title_length,
        default_max_posts, default_max_post_length, default_max_post_lines,
        default_max_poster_name_length, default_max_poster_sub_info_length, default_max_poster_meta_info_length,
        default_poster_name, default_id_format,
        default_thread_owner_user_id, default_thread_owner_group_id, default_thread_permissions,
        category, created_at, creator_user_id, creator_session_id, creator_turnstile_session_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
    [
      board.id, board.ownerUserId, board.ownerGroupId, board.permissions,
      board.name, board.description,
      board.maxThreads, board.maxThreadTitleLength,
      board.defaultMaxPosts, board.defaultMaxPostLength, board.defaultMaxPostLines,
      board.defaultMaxPosterNameLength, board.defaultMaxPosterSubInfoLength, board.defaultMaxPosterMetaInfoLength,
      board.defaultPosterName, board.defaultIdFormat,
      board.defaultThreadOwnerUserId, board.defaultThreadOwnerGroupId, board.defaultThreadPermissions,
      board.category,
      board.createdAt,
      board.adminMeta.creatorUserId, board.adminMeta.creatorSessionId, board.adminMeta.creatorTurnstileSessionId,
    ],
  )
}

export async function updateBoard(
  db: DbAdapter,
  id: string,
  updates: {
    name?: string
    description?: string | null
    ownerUserId?: string | null
    ownerGroupId?: string | null
    permissions?: string
    maxThreads?: number
    defaultMaxPosts?: number
    defaultMaxPostLength?: number
    defaultPosterName?: string
    defaultIdFormat?: string
    category?: string | null
  },
): Promise<boolean> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined)                 { fields.push('name = ?');                    values.push(updates.name) }
  if ('description' in updates)                   { fields.push('description = ?');             values.push(updates.description ?? null) }
  if ('ownerUserId' in updates)                   { fields.push('owner_user_id = ?');           values.push(updates.ownerUserId ?? null) }
  if ('ownerGroupId' in updates)                  { fields.push('owner_group_id = ?');          values.push(updates.ownerGroupId ?? null) }
  if (updates.permissions !== undefined)          { fields.push('permissions = ?');             values.push(updates.permissions) }
  if (updates.maxThreads !== undefined)           { fields.push('max_threads = ?');             values.push(updates.maxThreads) }
  if (updates.defaultMaxPosts !== undefined)      { fields.push('default_max_posts = ?');       values.push(updates.defaultMaxPosts) }
  if (updates.defaultMaxPostLength !== undefined) { fields.push('default_max_post_length = ?'); values.push(updates.defaultMaxPostLength) }
  if (updates.defaultPosterName !== undefined)    { fields.push('default_poster_name = ?');     values.push(updates.defaultPosterName) }
  if (updates.defaultIdFormat !== undefined)      { fields.push('default_id_format = ?');       values.push(updates.defaultIdFormat) }
  if ('category' in updates)                      { fields.push('category = ?');                values.push(updates.category ?? null) }

  if (fields.length === 0) return true
  values.push(id)
  const result = await db.run(`UPDATE boards SET ${fields.join(', ')} WHERE id = ?`, values)
  return result.changes > 0
}

export async function deleteBoard(db: DbAdapter, id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM boards WHERE id = ?', [id])
  return result.changes > 0
}
