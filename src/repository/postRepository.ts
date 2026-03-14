import type { Post } from '../types'

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
    createdAt: row.created_at,
    adminMeta: {
      creatorUserId: row.creator_user_id,
      creatorSessionId: row.creator_session_id,
      creatorTurnstileSessionId: row.creator_turnstile_session_id,
    },
  }
}

export async function findPostsByThreadId(db: D1Database, threadId: string): Promise<Post[]> {
  const result = await db
    .prepare('SELECT * FROM posts WHERE thread_id = ? ORDER BY post_number ASC')
    .bind(threadId)
    .all<PostRow>()
  return result.results.map(rowToPost)
}

export async function findPostByNumber(
  db: D1Database,
  threadId: string,
  postNumber: number,
): Promise<Post | null> {
  const row = await db
    .prepare('SELECT * FROM posts WHERE thread_id = ? AND post_number = ?')
    .bind(threadId, postNumber)
    .first<PostRow>()
  return row ? rowToPost(row) : null
}

// スレッド内の次の post_number を取得
export async function nextPostNumber(db: D1Database, threadId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(MAX(post_number), 0) + 1 AS next FROM posts WHERE thread_id = ?')
    .bind(threadId)
    .first<{ next: number }>()
  return row?.next ?? 1
}

export async function insertPost(db: D1Database, post: Post): Promise<void> {
  await db
    .prepare(`
      INSERT INTO posts (
        id, thread_id, post_number, owner_user_id, owner_group_id, permissions,
        user_id, display_user_id, poster_name, poster_sub_info, content, created_at,
        creator_user_id, creator_session_id, creator_turnstile_session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      post.id, post.threadId, post.postNumber,
      post.ownerUserId, post.ownerGroupId, post.permissions,
      post.userId, post.displayUserId, post.posterName, post.posterSubInfo,
      post.content, post.createdAt,
      post.adminMeta.creatorUserId, post.adminMeta.creatorSessionId, post.adminMeta.creatorTurnstileSessionId,
    )
    .run()
}

// 投稿内容の更新 (ソフト削除=削除マークの書き込みにも使用)
export async function updatePostContent(
  db: D1Database,
  threadId: string,
  postNumber: number,
  content: string,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE posts SET content = ? WHERE thread_id = ? AND post_number = ?')
    .bind(content, threadId, postNumber)
    .run()
  return result.meta.changes > 0
}
