import type { Board } from '../types'
import type { DbAdapter } from '../adapters/db'

type BoardRow = {
  id: string
  administrators: string
  members: string
  permissions: string
  name: string
  description: string
  max_threads: number
  max_thread_title_length: number
  default_max_posts: number
  default_max_post_length: number
  default_max_post_lines: number
  default_max_poster_name_length: number
  default_max_poster_option_length: number
  default_poster_name: string
  default_id_format: string
  default_thread_administrators: string
  default_thread_members: string
  default_thread_permissions: string
  default_post_administrators: string
  default_post_members: string
  default_post_permissions: string
  category: string
  created_at: string
  creator_user_id: string | null
  creator_session_id: string | null
  creator_turnstile_session_id: string | null
}

function rowToBoard(row: BoardRow): Board {
  return {
    id: row.id,
    administrators: row.administrators,
    members: row.members,
    permissions: row.permissions,
    name: row.name,
    description: row.description,
    maxThreads: row.max_threads,
    maxThreadTitleLength: row.max_thread_title_length,
    defaultMaxPosts: row.default_max_posts,
    defaultMaxPostLength: row.default_max_post_length,
    defaultMaxPostLines: row.default_max_post_lines,
    defaultMaxPosterNameLength: row.default_max_poster_name_length,
    defaultMaxPosterOptionLength: row.default_max_poster_option_length,
    defaultPosterName: row.default_poster_name,
    defaultIdFormat: row.default_id_format as Board['defaultIdFormat'],
    defaultThreadAdministrators: row.default_thread_administrators,
    defaultThreadMembers: row.default_thread_members,
    defaultThreadPermissions: row.default_thread_permissions,
    defaultPostAdministrators: row.default_post_administrators,
    defaultPostMembers: row.default_post_members,
    defaultPostPermissions: row.default_post_permissions,
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

export type BoardWriteFields = {
  administrators?: string
  members?: string
  permissions?: string
  name?: string
  description?: string
  maxThreads?: number
  maxThreadTitleLength?: number
  defaultMaxPosts?: number
  defaultMaxPostLength?: number
  defaultMaxPostLines?: number
  defaultMaxPosterNameLength?: number
  defaultMaxPosterOptionLength?: number
  defaultPosterName?: string
  defaultIdFormat?: string
  defaultThreadAdministrators?: string
  defaultThreadMembers?: string
  defaultThreadPermissions?: string
  defaultPostAdministrators?: string
  defaultPostMembers?: string
  defaultPostPermissions?: string
  category?: string
}

export async function insertBoard(db: DbAdapter, board: Board): Promise<void> {
  await db.run(
    `INSERT INTO boards (
      id, administrators, members, permissions, name, description,
      max_threads, max_thread_title_length,
      default_max_posts, default_max_post_length, default_max_post_lines,
      default_max_poster_name_length, default_max_poster_option_length,
      default_poster_name, default_id_format,
      default_thread_administrators, default_thread_members, default_thread_permissions,
      default_post_administrators, default_post_members, default_post_permissions,
      category, created_at, creator_user_id, creator_session_id, creator_turnstile_session_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      board.id, board.administrators, board.members, board.permissions,
      board.name, board.description,
      board.maxThreads, board.maxThreadTitleLength,
      board.defaultMaxPosts, board.defaultMaxPostLength, board.defaultMaxPostLines,
      board.defaultMaxPosterNameLength, board.defaultMaxPosterOptionLength,
      board.defaultPosterName, board.defaultIdFormat,
      board.defaultThreadAdministrators, board.defaultThreadMembers, board.defaultThreadPermissions,
      board.defaultPostAdministrators, board.defaultPostMembers, board.defaultPostPermissions,
      board.category, board.createdAt,
      board.adminMeta.creatorUserId, board.adminMeta.creatorSessionId, board.adminMeta.creatorTurnstileSessionId,
    ],
  )
}

export async function updateBoard(db: DbAdapter, id: string, f: BoardWriteFields): Promise<boolean> {
  const fields: string[] = []
  const values: unknown[] = []

  if (f.administrators !== undefined)           { fields.push('administrators = ?');               values.push(f.administrators) }
  if (f.members !== undefined)                  { fields.push('members = ?');                      values.push(f.members) }
  if (f.permissions !== undefined)              { fields.push('permissions = ?');                  values.push(f.permissions) }
  if (f.name !== undefined)                     { fields.push('name = ?');                         values.push(f.name) }
  if (f.description !== undefined)              { fields.push('description = ?');                  values.push(f.description) }
  if (f.maxThreads !== undefined)               { fields.push('max_threads = ?');                  values.push(f.maxThreads) }
  if (f.maxThreadTitleLength !== undefined)     { fields.push('max_thread_title_length = ?');      values.push(f.maxThreadTitleLength) }
  if (f.defaultMaxPosts !== undefined)          { fields.push('default_max_posts = ?');            values.push(f.defaultMaxPosts) }
  if (f.defaultMaxPostLength !== undefined)     { fields.push('default_max_post_length = ?');      values.push(f.defaultMaxPostLength) }
  if (f.defaultMaxPostLines !== undefined)      { fields.push('default_max_post_lines = ?');       values.push(f.defaultMaxPostLines) }
  if (f.defaultMaxPosterNameLength !== undefined)   { fields.push('default_max_poster_name_length = ?');   values.push(f.defaultMaxPosterNameLength) }
  if (f.defaultMaxPosterOptionLength !== undefined) { fields.push('default_max_poster_option_length = ?'); values.push(f.defaultMaxPosterOptionLength) }
  if (f.defaultPosterName !== undefined)        { fields.push('default_poster_name = ?');          values.push(f.defaultPosterName) }
  if (f.defaultIdFormat !== undefined)          { fields.push('default_id_format = ?');            values.push(f.defaultIdFormat) }
  if (f.defaultThreadAdministrators !== undefined) { fields.push('default_thread_administrators = ?'); values.push(f.defaultThreadAdministrators) }
  if (f.defaultThreadMembers !== undefined)     { fields.push('default_thread_members = ?');       values.push(f.defaultThreadMembers) }
  if (f.defaultThreadPermissions !== undefined) { fields.push('default_thread_permissions = ?');   values.push(f.defaultThreadPermissions) }
  if (f.defaultPostAdministrators !== undefined) { fields.push('default_post_administrators = ?'); values.push(f.defaultPostAdministrators) }
  if (f.defaultPostMembers !== undefined)       { fields.push('default_post_members = ?');         values.push(f.defaultPostMembers) }
  if (f.defaultPostPermissions !== undefined)   { fields.push('default_post_permissions = ?');     values.push(f.defaultPostPermissions) }
  if (f.category !== undefined)                 { fields.push('category = ?');                     values.push(f.category) }

  if (fields.length === 0) return true
  values.push(id)
  const result = await db.run(`UPDATE boards SET ${fields.join(', ')} WHERE id = ?`, values)
  return result.changes > 0
}

export async function deleteBoard(db: DbAdapter, id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM boards WHERE id = ?', [id])
  return result.changes > 0
}
