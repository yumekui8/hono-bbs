import type { Post } from '../types'

type PostRow = {
  id: string
  thread_id: string
  content: string
  created_at: string
}

function rowToPost(row: PostRow): Post {
  return {
    id: row.id,
    threadId: row.thread_id,
    content: row.content,
    createdAt: row.created_at,
  }
}

export async function findPostsByThreadId(db: D1Database, threadId: string): Promise<Post[]> {
  const result = await db
    .prepare('SELECT * FROM posts WHERE thread_id = ? ORDER BY created_at ASC')
    .bind(threadId)
    .all<PostRow>()
  return result.results.map(rowToPost)
}

export async function insertPost(db: D1Database, post: Post): Promise<void> {
  await db
    .prepare('INSERT INTO posts (id, thread_id, content, created_at) VALUES (?, ?, ?, ?)')
    .bind(post.id, post.threadId, post.content, post.createdAt)
    .run()
}

// thread_id も条件に含め、別スレッドの投稿を誤削除しないよう保護
export async function deletePost(db: D1Database, threadId: string, postId: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM posts WHERE id = ? AND thread_id = ?')
    .bind(postId, threadId)
    .run()
  return result.meta.changes > 0
}
