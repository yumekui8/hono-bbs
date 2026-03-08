import { z } from 'zod'
import type { Post } from '../types'
import * as postRepository from '../repository/postRepository'
import * as threadRepository from '../repository/threadRepository'
import * as boardRepository from '../repository/boardRepository'
import { hasPermission, PERM } from '../utils/permission'
import { computeDisplayUserId } from '../utils/hash'

const createPostSchema = z.object({
  content: z.string().min(1).max(5000),
  posterName: z.string().max(50).optional(),
  posterSubInfo: z.string().max(100).optional(),
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
  boardId: string,
  threadId: string,
  input: CreatePostInput,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
  sessionId: string | null,
  turnstileSessionId: string | null,
): Promise<Post> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) throw new Error('THREAD_NOT_FOUND')

  const board = await boardRepository.findBoardById(db, boardId)
  if (!board) throw new Error('BOARD_NOT_FOUND')

  // 書き込み権限チェック
  if (!hasPermission({ userId, userGroupIds, ownerUserId: thread.ownerUserId, ownerGroupId: thread.ownerGroupId, permissions: thread.permissions, required: PERM.WRITE, isAdmin })) {
    throw new Error('FORBIDDEN')
  }

  // 書き込み数上限チェック (スレッド設定 → 板デフォルト)
  const maxPosts = thread.maxPosts ?? board.defaultMaxPosts
  if (thread.postCount >= maxPosts) throw new Error('POST_LIMIT_REACHED')

  // 文字数・行数チェック
  const maxLength = thread.maxPostLength ?? board.defaultMaxPostLength
  const maxLines = thread.maxPostLines ?? board.defaultMaxPostLines
  if (input.content.length > maxLength) throw new Error('CONTENT_TOO_LONG')
  if (input.content.split('\n').length > maxLines) throw new Error('CONTENT_TOO_MANY_LINES')

  // IDフォーマット (スレッド設定 → 板デフォルト)
  const idFormat = thread.idFormat ?? board.defaultIdFormat
  const displayUserId = await computeDisplayUserId(idFormat, userId, turnstileSessionId)

  // 投稿者名 (入力 → スレッドデフォルト → 板デフォルト)
  const posterName = input.posterName ?? thread.posterName ?? board.defaultPosterName

  const now = new Date().toISOString()
  const postNumber = await postRepository.nextPostNumber(db, threadId)

  const post: Post = {
    id: crypto.randomUUID(),
    threadId,
    postNumber,
    userId,
    displayUserId,
    posterName,
    posterSubInfo: input.posterSubInfo ?? null,
    content: input.content,
    createdAt: now,
    adminMeta: { creatorUserId: userId, creatorSessionId: sessionId, creatorTurnstileSessionId: turnstileSessionId },
  }

  await postRepository.insertPost(db, post)
  // スレッドの post_count と updated_at を更新
  await threadRepository.incrementPostCount(db, threadId, now)

  return post
}

export async function deletePost(
  db: D1Database,
  boardId: string,
  threadId: string,
  postId: string,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
): Promise<boolean> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return false

  if (!hasPermission({ userId, userGroupIds, ownerUserId: thread.ownerUserId, ownerGroupId: thread.ownerGroupId, permissions: thread.permissions, required: PERM.DELETE, isAdmin })) {
    throw new Error('FORBIDDEN')
  }

  return postRepository.deletePost(db, threadId, postId)
}
