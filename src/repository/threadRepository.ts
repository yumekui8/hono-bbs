import type { Thread, Post } from '../types'
import type { DbAdapter } from '../adapters/db'

type ThreadRow = {
  id: string
  board_id: string
  administrators: string
  members: string
  permissions: string
  title: string
  max_posts: number
  max_post_length: number
  max_post_lines: number
  max_poster_name_length: number
  max_poster_option_length: number
  poster_name: string
  id_format: string
  post_count: number
  is_edited: number
  edited_at: string | null
  created_at: string
  updated_at: string
  creator_user_id: string | null
  creator_session_id: string | null
  creator_turnstile_session_id: string | null
}

// 第1レスのカラムをエイリアスで結合する際の拡張型
type ThreadWithFirstPostRow = ThreadRow & {
  p_id: string | null
  p_post_number: number | null
  p_administrators: string | null
  p_members: string | null
  p_permissions: string | null
  p_author_id: string | null
  p_poster_name: string | null
  p_poster_option_info: string | null
  p_content: string | null
  p_is_deleted: number | null
  p_is_edited: number | null
  p_edited_at: string | null
  p_created_at: string | null
  p_creator_user_id: string | null
  p_creator_session_id: string | null
  p_creator_turnstile_session_id: string | null
}

function rowToThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    boardId: row.board_id,
    administrators: row.administrators,
    members: row.members,
    permissions: row.permissions,
    title: row.title,
    maxPosts: row.max_posts,
    maxPostLength: row.max_post_length,
    maxPostLines: row.max_post_lines,
    maxPosterNameLength: row.max_poster_name_length,
    maxPosterOptionLength: row.max_poster_option_length,
    posterName: row.poster_name,
    idFormat: row.id_format,
    postCount: row.post_count,
    isEdited: row.is_edited === 1,
    editedAt: row.edited_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    adminMeta: {
      creatorUserId: row.creator_user_id,
      creatorSessionId: row.creator_session_id,
      creatorTurnstileSessionId: row.creator_turnstile_session_id,
    },
  }
}

function rowToFirstPost(row: ThreadWithFirstPostRow): Post | null {
  if (!row.p_id) return null
  return {
    id: row.p_id,
    threadId: row.id,
    postNumber: row.p_post_number!,
    administrators: row.p_administrators ?? '',
    members: row.p_members ?? '',
    permissions: row.p_permissions ?? '31,28,24,16',
    authorId: row.p_author_id ?? '',
    posterName: row.p_poster_name ?? '',
    posterOptionInfo: row.p_poster_option_info ?? '',
    content: row.p_content ?? '',
    isDeleted: row.p_is_deleted === 1,
    isEdited: row.p_is_edited === 1,
    editedAt: row.p_edited_at ?? null,
    createdAt: row.p_created_at ?? '',
    adminMeta: {
      creatorUserId: row.p_creator_user_id ?? null,
      creatorSessionId: row.p_creator_session_id ?? null,
      creatorTurnstileSessionId: row.p_creator_turnstile_session_id ?? null,
    },
  }
}

export async function findThreadsByBoardId(db: DbAdapter, boardId: string): Promise<Thread[]> {
  const result = await db.all<ThreadWithFirstPostRow>(
    `SELECT
      t.*,
      p.id AS p_id,
      p.post_number AS p_post_number,
      p.administrators AS p_administrators,
      p.members AS p_members,
      p.permissions AS p_permissions,
      p.author_id AS p_author_id,
      p.poster_name AS p_poster_name,
      p.poster_option_info AS p_poster_option_info,
      p.content AS p_content,
      p.is_deleted AS p_is_deleted,
      p.is_edited AS p_is_edited,
      p.edited_at AS p_edited_at,
      p.created_at AS p_created_at,
      p.creator_user_id AS p_creator_user_id,
      p.creator_session_id AS p_creator_session_id,
      p.creator_turnstile_session_id AS p_creator_turnstile_session_id
    FROM threads t
    LEFT JOIN posts p ON p.thread_id = t.id AND p.post_number = 1
    WHERE t.board_id = ?
    ORDER BY t.updated_at DESC`,
    [boardId],
  )
  return result.results.map(row => ({ ...rowToThread(row), firstPost: rowToFirstPost(row) }))
}

export async function findThreadById(db: DbAdapter, id: string): Promise<Thread | null> {
  const row = await db.first<ThreadRow>('SELECT * FROM threads WHERE id = ?', [id])
  return row ? rowToThread(row) : null
}

export async function insertThread(db: DbAdapter, thread: Thread): Promise<void> {
  await db.run(
    `INSERT INTO threads (
      id, board_id, administrators, members, permissions, title,
      max_posts, max_post_length, max_post_lines,
      max_poster_name_length, max_poster_option_length,
      poster_name, id_format, post_count, is_edited, edited_at,
      created_at, updated_at, creator_user_id, creator_session_id, creator_turnstile_session_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      thread.id, thread.boardId, thread.administrators, thread.members, thread.permissions,
      thread.title,
      thread.maxPosts, thread.maxPostLength, thread.maxPostLines,
      thread.maxPosterNameLength, thread.maxPosterOptionLength,
      thread.posterName, thread.idFormat, thread.postCount,
      thread.isEdited ? 1 : 0, thread.editedAt,
      thread.createdAt, thread.updatedAt,
      thread.adminMeta.creatorUserId, thread.adminMeta.creatorSessionId, thread.adminMeta.creatorTurnstileSessionId,
    ],
  )
}

export async function incrementPostCount(db: DbAdapter, threadId: string, updatedAt: string): Promise<void> {
  await db.run(
    'UPDATE threads SET post_count = post_count + 1, updated_at = ? WHERE id = ?',
    [updatedAt, threadId],
  )
}

export type ThreadUpdateFields = {
  title?: string
  posterName?: string
  administrators?: string
  members?: string
  permissions?: string
  maxPosts?: number
  maxPostLength?: number
  maxPostLines?: number
  maxPosterNameLength?: number
  maxPosterOptionLength?: number
  idFormat?: string
  isEdited?: boolean
  editedAt?: string | null
}

export async function updateThread(
  db: DbAdapter,
  id: string,
  updates: ThreadUpdateFields,
): Promise<boolean> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.title !== undefined)              { fields.push('title = ?');                values.push(updates.title) }
  if (updates.posterName !== undefined)         { fields.push('poster_name = ?');          values.push(updates.posterName) }
  if (updates.administrators !== undefined)     { fields.push('administrators = ?');       values.push(updates.administrators) }
  if (updates.members !== undefined)            { fields.push('members = ?');              values.push(updates.members) }
  if (updates.permissions !== undefined)        { fields.push('permissions = ?');          values.push(updates.permissions) }
  if (updates.maxPosts !== undefined)           { fields.push('max_posts = ?');            values.push(updates.maxPosts) }
  if (updates.maxPostLength !== undefined)      { fields.push('max_post_length = ?');      values.push(updates.maxPostLength) }
  if (updates.maxPostLines !== undefined)       { fields.push('max_post_lines = ?');       values.push(updates.maxPostLines) }
  if (updates.maxPosterNameLength !== undefined){ fields.push('max_poster_name_length = ?'); values.push(updates.maxPosterNameLength) }
  if (updates.maxPosterOptionLength !== undefined) { fields.push('max_poster_option_length = ?'); values.push(updates.maxPosterOptionLength) }
  if (updates.idFormat !== undefined)           { fields.push('id_format = ?');            values.push(updates.idFormat) }
  if (updates.isEdited !== undefined)           { fields.push('is_edited = ?');            values.push(updates.isEdited ? 1 : 0) }
  if ('editedAt' in updates)                    { fields.push('edited_at = ?');            values.push(updates.editedAt ?? null) }

  if (fields.length === 0) return true
  fields.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)
  const result = await db.run(`UPDATE threads SET ${fields.join(', ')} WHERE id = ?`, values)
  return result.changes > 0
}

export async function deleteThread(db: DbAdapter, id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM threads WHERE id = ?', [id])
  return result.changes > 0
}
