import type { Thread, Post } from '../types'
import type { DbAdapter } from '../adapters/db'

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

// 第1レスのカラムをエイリアスで結合する際の拡張型
type ThreadWithFirstPostRow = ThreadRow & {
  p_id: string | null
  p_post_number: number | null
  p_owner_user_id: string | null
  p_owner_group_id: string | null
  p_permissions: string | null
  p_user_id: string | null
  p_display_user_id: string | null
  p_poster_name: string | null
  p_poster_sub_info: string | null
  p_content: string | null
  p_created_at: string | null
  p_creator_user_id: string | null
  p_creator_session_id: string | null
  p_creator_turnstile_session_id: string | null
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

function rowToFirstPost(row: ThreadWithFirstPostRow): Post | null {
  if (!row.p_id) return null
  return {
    id: row.p_id,
    threadId: row.id,
    postNumber: row.p_post_number!,
    ownerUserId: row.p_owner_user_id,
    ownerGroupId: row.p_owner_group_id,
    permissions: row.p_permissions!,
    userId: row.p_user_id,
    displayUserId: row.p_display_user_id!,
    posterName: row.p_poster_name!,
    posterSubInfo: row.p_poster_sub_info,
    content: row.p_content!,
    createdAt: row.p_created_at!,
    adminMeta: {
      creatorUserId: row.p_creator_user_id,
      creatorSessionId: row.p_creator_session_id,
      creatorTurnstileSessionId: row.p_creator_turnstile_session_id,
    },
  }
}

export async function findThreadsByBoardId(db: DbAdapter, boardId: string): Promise<Thread[]> {
  const result = await db.all<ThreadWithFirstPostRow>(
    `
      SELECT
        t.*,
        p.id AS p_id,
        p.post_number AS p_post_number,
        p.owner_user_id AS p_owner_user_id,
        p.owner_group_id AS p_owner_group_id,
        p.permissions AS p_permissions,
        p.user_id AS p_user_id,
        p.display_user_id AS p_display_user_id,
        p.poster_name AS p_poster_name,
        p.poster_sub_info AS p_poster_sub_info,
        p.content AS p_content,
        p.created_at AS p_created_at,
        p.creator_user_id AS p_creator_user_id,
        p.creator_session_id AS p_creator_session_id,
        p.creator_turnstile_session_id AS p_creator_turnstile_session_id
      FROM threads t
      LEFT JOIN posts p ON p.thread_id = t.id AND p.post_number = 1
      WHERE t.board_id = ?
      ORDER BY t.updated_at DESC
    `,
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
    `
      INSERT INTO threads (
        id, board_id, owner_user_id, owner_group_id, permissions, title,
        max_posts, max_post_length, max_post_lines,
        max_poster_name_length, max_poster_sub_info_length, max_poster_meta_info_length,
        poster_name, id_format, post_count, created_at, updated_at,
        creator_user_id, creator_session_id, creator_turnstile_session_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
    [
      thread.id, thread.boardId, thread.ownerUserId, thread.ownerGroupId, thread.permissions,
      thread.title,
      thread.maxPosts, thread.maxPostLength, thread.maxPostLines,
      thread.maxPosterNameLength, thread.maxPosterSubInfoLength, thread.maxPosterMetaInfoLength,
      thread.posterName, thread.idFormat, thread.postCount, thread.createdAt, thread.updatedAt,
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

export async function updateThread(
  db: DbAdapter,
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
  const result = await db.run(`UPDATE threads SET ${fields.join(', ')} WHERE id = ?`, values)
  return result.changes > 0
}

export async function deleteThread(db: DbAdapter, id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM threads WHERE id = ?', [id])
  return result.changes > 0
}
