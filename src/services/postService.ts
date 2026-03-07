import { z } from 'zod'
import type { Post } from '../types'
import * as postRepository from '../repository/postRepository'
import * as threadRepository from '../repository/threadRepository'

const createPostSchema = z.object({
  content: z.string().min(1).max(2000),
})

export type CreatePostInput = z.infer<typeof createPostSchema>

export function parseCreatePost(data: unknown): CreatePostInput {
  return createPostSchema.parse(data)
}

export async function getPostsByThreadId(db: D1Database, threadId: string): Promise<Post[]> {
  return postRepository.findPostsByThreadId(db, threadId)
}

export async function createPost(
  db: D1Database,
  threadId: string,
  input: CreatePostInput,
): Promise<Post> {
  // スレッド存在チェック
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread) {
    throw new Error('THREAD_NOT_FOUND')
  }

  const post: Post = {
    id: crypto.randomUUID(),
    threadId,
    content: input.content,
    createdAt: new Date().toISOString(),
  }
  await postRepository.insertPost(db, post)
  return post
}

export async function deletePost(
  db: D1Database,
  threadId: string,
  postId: string,
): Promise<boolean> {
  return postRepository.deletePost(db, threadId, postId)
}
