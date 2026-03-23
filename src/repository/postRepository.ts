import type { Post } from '../types'
import type { DbAdapter } from '../adapters/db'

type PostRow = {
  id: string
  thread_id: string
  post_number: number
  owner_user_id: string | null
  owner_group_id: string | null
  permissions: string
  user_id: string | null
  display_user_id: string
  poster_name: string
  poster_sub_info: string | null
  content: string
  is_deleted: number
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
    ownerUserId: row.owner_user_id,
    ownerGroupId: row.owner_group_id,
    permissions: row.permissions,
    userId: row.user_id,
    displayUserId: row.display_user_id,
    posterName: row.poster_name,
    posterSubInfo: row.poster_sub_info,
    content: row.content,
    isDeleted: row.is_deleted === 1,
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
// range.to === null のとき from 以降すべて、それ以外は from～to 包含
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

// スレッド内の次の post_number を取得
export async function nextPostNumber(db: DbAdapter, threadId: string): Promise<number> {
  const row = await db.first<{ next: number }>(
    'SELECT COALESCE(MAX(post_number), 0) + 1 AS next FROM posts WHERE thread_id = ?',
    [threadId],
  )
  return row?.next ?? 1
}

export async function insertPost(db: DbAdapter, post: Post): Promise<void> {
  await db.run(
    `
      INSERT INTO posts (
        id, thread_id, post_number, owner_user_id, owner_group_id, permissions,
        user_id, display_user_id, poster_name, poster_sub_info, content, created_at,
        creator_user_id, creator_session_id, creator_turnstile_session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      post.id, post.threadId, post.postNumber,
      post.ownerUserId, post.ownerGroupId, post.permissions,
      post.userId, post.displayUserId, post.posterName, post.posterSubInfo,
      post.content, post.createdAt,
      post.adminMeta.creatorUserId, post.adminMeta.creatorSessionId, post.adminMeta.creatorTurnstileSessionId,
    ],
  )
}

// 投稿内容の更新
export async function updatePostContent(
  db: DbAdapter,
  threadId: string,
  postNumber: number,
  content: string,
): Promise<boolean> {
  const result = await db.run(
    'UPDATE posts SET content = ? WHERE thread_id = ? AND post_number = ?',
    [content, threadId, postNumber],
  )
  return result.changes > 0
}

// 投稿のソフト削除 (is_deleted = 1 に設定)
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
