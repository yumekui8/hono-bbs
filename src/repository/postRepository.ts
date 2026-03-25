import type { Post } from '../types'
import type { DbAdapter } from '../adapters/db'

type PostRow = {
  id: string
  thread_id: string
  post_number: number
  administrators: string
  members: string
  permissions: string
  author_id: string
  poster_name: string
  poster_option_info: string
  content: string
  is_deleted: number
  is_edited: number
  edited_at: string | null
  created_at: string
  creator_user_id: string | null
  creator_session_id: string | null
  creator_turnstile_session_id: string | null
}

function rowToPost(row: PostRow): Post {
  return {
    id: row.id,
    threadId: row.thread_id,
    postNumber: row.post_number,
    administrators: row.administrators,
    members: row.members,
    permissions: row.permissions,
    authorId: row.author_id,
    posterName: row.poster_name,
    posterOptionInfo: row.poster_option_info,
    content: row.content,
    isDeleted: row.is_deleted === 1,
    isEdited: row.is_edited === 1,
    editedAt: row.edited_at,
    createdAt: row.created_at,
    adminMeta: {
      creatorUserId: row.creator_user_id,
      creatorSessionId: row.creator_session_id,
      creatorTurnstileSessionId: row.creator_turnstile_session_id,
    },
  }
}

export async function findPostsByThreadId(db: DbAdapter, threadId: string): Promise<Post[]> {
  const result = await db.all<PostRow>(
    'SELECT * FROM posts WHERE thread_id = ? ORDER BY post_number ASC',
    [threadId],
  )
  return result.results.map(rowToPost)
}

export type PostRange = { from: number; to: number | null }

// 複数レンジを OR 結合した単一クエリで取得
export async function findPostsByRanges(
  db: DbAdapter,
  threadId: string,
  ranges: PostRange[],
): Promise<Post[]> {
  if (ranges.length === 0) return findPostsByThreadId(db, threadId)

  const conditions: string[] = []
  const params: unknown[] = [threadId]

  for (const r of ranges) {
    if (r.to === null) {
      conditions.push('post_number >= ?')
      params.push(r.from)
    } else if (r.from === r.to) {
      conditions.push('post_number = ?')
      params.push(r.from)
    } else {
      conditions.push('(post_number >= ? AND post_number <= ?)')
      params.push(r.from, r.to)
    }
  }

  const sql = `SELECT * FROM posts WHERE thread_id = ? AND (${conditions.join(' OR ')}) ORDER BY post_number ASC`
  const result = await db.all<PostRow>(sql, params)
  return result.results.map(rowToPost)
}

export async function findPostByNumber(
  db: DbAdapter,
  threadId: string,
  postNumber: number,
): Promise<Post | null> {
  const row = await db.first<PostRow>(
    'SELECT * FROM posts WHERE thread_id = ? AND post_number = ?',
    [threadId, postNumber],
  )
  return row ? rowToPost(row) : null
}

export async function nextPostNumber(db: DbAdapter, threadId: string): Promise<number> {
  const row = await db.first<{ next: number }>(
    'SELECT COALESCE(MAX(post_number), 0) + 1 AS next FROM posts WHERE thread_id = ?',
    [threadId],
  )
  return row?.next ?? 1
}

export async function insertPost(db: DbAdapter, post: Post): Promise<void> {
  await db.run(
    `INSERT INTO posts (
      id, thread_id, post_number, administrators, members, permissions,
      author_id, poster_name, poster_option_info, content,
      is_deleted, is_edited, edited_at, created_at,
      creator_user_id, creator_session_id, creator_turnstile_session_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      post.id, post.threadId, post.postNumber,
      post.administrators, post.members, post.permissions,
      post.authorId, post.posterName, post.posterOptionInfo,
      post.content, post.isDeleted ? 1 : 0, post.isEdited ? 1 : 0, post.editedAt,
      post.createdAt,
      post.adminMeta.creatorUserId, post.adminMeta.creatorSessionId, post.adminMeta.creatorTurnstileSessionId,
    ],
  )
}

// 投稿内容の更新 (PUT: content + isEdited フラグ)
export async function updatePostContent(
  db: DbAdapter,
  threadId: string,
  postNumber: number,
  content: string,
  editedAt: string,
): Promise<boolean> {
  const result = await db.run(
    'UPDATE posts SET content = ?, is_edited = 1, edited_at = ? WHERE thread_id = ? AND post_number = ?',
    [content, editedAt, threadId, postNumber],
  )
  return result.changes > 0
}

// 投稿メタデータの更新 (PATCH)
export async function patchPost(
  db: DbAdapter,
  threadId: string,
  postNumber: number,
  updates: {
    administrators?: string
    members?: string
    permissions?: string
  },
): Promise<boolean> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.administrators !== undefined) { fields.push('administrators = ?'); values.push(updates.administrators) }
  if (updates.members !== undefined)        { fields.push('members = ?');        values.push(updates.members) }
  if (updates.permissions !== undefined)    { fields.push('permissions = ?');    values.push(updates.permissions) }

  if (fields.length === 0) return true
  values.push(threadId, postNumber)
  const result = await db.run(
    `UPDATE posts SET ${fields.join(', ')} WHERE thread_id = ? AND post_number = ?`,
    values,
  )
  return result.changes > 0
}

// 投稿のソフト削除
export async function softDeletePost(
  db: DbAdapter,
  threadId: string,
  postNumber: number,
): Promise<boolean> {
  const result = await db.run(
    'UPDATE posts SET is_deleted = 1 WHERE thread_id = ? AND post_number = ?',
    [threadId, postNumber],
  )
  return result.changes > 0
}
