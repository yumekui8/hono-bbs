import type { Thread } from '../types'

type ThreadRow = {
  id: string
  board_id: string
  owner_user_id: string | null
  owner_group_id: string | null
  permissions: string
  title: string
  max_posts: number | null
  max_post_length: number | null
  max_post_lines: number | null
  max_poster_name_length: number | null
  max_poster_sub_info_length: number | null
  max_poster_meta_info_length: number | null
  poster_name: string | null
  id_format: string | null
  post_count: number
  created_at: string
  updated_at: string
  creator_user_id: string | null
  creator_session_id: string | null
  creator_turnstile_session_id: string | null
}

function rowToThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    boardId: row.board_id,
    ownerUserId: row.owner_user_id,
    ownerGroupId: row.owner_group_id,
    permissions: row.permissions,
    title: row.title,
    maxPosts: row.max_posts,
    maxPostLength: row.max_post_length,
    maxPostLines: row.max_post_lines,
    maxPosterNameLength: row.max_poster_name_length,
    maxPosterSubInfoLength: row.max_poster_sub_info_length,
    maxPosterMetaInfoLength: row.max_poster_meta_info_length,
    posterName: row.poster_name,
    idFormat: row.id_format as Thread['idFormat'],
    postCount: row.post_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    adminMeta: {
      creatorUserId: row.creator_user_id,
      creatorSessionId: row.creator_session_id,
      creatorTurnstileSessionId: row.creator_turnstile_session_id,
    },
  }
}

export async function findThreadsByBoardId(db: D1Database, boardId: string): Promise<Thread[]> {
  const result = await db
    .prepare('SELECT * FROM threads WHERE board_id = ? ORDER BY updated_at DESC')
    .bind(boardId)
    .all<ThreadRow>()
  return result.results.map(rowToThread)
}

export async function findThreadById(db: D1Database, id: string): Promise<Thread | null> {
  const row = await db.prepare('SELECT * FROM threads WHERE id = ?').bind(id).first<ThreadRow>()
  return row ? rowToThread(row) : null
}

export async function insertThread(db: D1Database, thread: Thread): Promise<void> {
  await db
    .prepare(`
      INSERT INTO threads (
        id, board_id, owner_user_id, owner_group_id, permissions, title,
        max_posts, max_post_length, max_post_lines,
        max_poster_name_length, max_poster_sub_info_length, max_poster_meta_info_length,
        poster_name, id_format, post_count, created_at, updated_at,
        creator_user_id, creator_session_id, creator_turnstile_session_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `)
    .bind(
      thread.id, thread.boardId, thread.ownerUserId, thread.ownerGroupId, thread.permissions,
      thread.title,
      thread.maxPosts, thread.maxPostLength, thread.maxPostLines,
      thread.maxPosterNameLength, thread.maxPosterSubInfoLength, thread.maxPosterMetaInfoLength,
      thread.posterName, thread.idFormat, thread.postCount, thread.createdAt, thread.updatedAt,
      thread.adminMeta.creatorUserId, thread.adminMeta.creatorSessionId, thread.adminMeta.creatorTurnstileSessionId,
    )
    .run()
}

export async function incrementPostCount(db: D1Database, threadId: string, updatedAt: string): Promise<void> {
  await db
    .prepare('UPDATE threads SET post_count = post_count + 1, updated_at = ? WHERE id = ?')
    .bind(updatedAt, threadId)
    .run()
}

export async function updateThread(
  db: D1Database,
  id: string,
  updates: {
    title?: string
    maxPosts?: number | null
    posterName?: string | null
    idFormat?: string | null
  },
): Promise<boolean> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.title !== undefined) { fields.push('title = ?');       values.push(updates.title) }
  if ('maxPosts' in updates)       { fields.push('max_posts = ?');   values.push(updates.maxPosts ?? null) }
  if ('posterName' in updates)     { fields.push('poster_name = ?'); values.push(updates.posterName ?? null) }
  if ('idFormat' in updates)       { fields.push('id_format = ?');   values.push(updates.idFormat ?? null) }

  if (fields.length === 0) return true
  fields.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)
  const result = await db
    .prepare(`UPDATE threads SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()
  return result.meta.changes > 0
}

export async function deleteThread(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM threads WHERE id = ?').bind(id).run()
  return result.meta.changes > 0
}
