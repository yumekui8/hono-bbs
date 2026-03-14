import { z } from 'zod'
import type { Post } from '../types'
import * as postRepository from '../repository/postRepository'
import * as threadRepository from '../repository/threadRepository'
import * as boardRepository from '../repository/boardRepository'
import { hasPermission } from '../utils/permission'
import { computeDisplayUserId } from '../utils/hash'

const createPostSchema = z.object({
  content: z.string().min(1).max(5000),
  posterName: z.string().max(50).optional(),
  posterSubInfo: z.string().max(100).optional(),
})

// 投稿更新 (ソフト削除含む): content のみ更新可能
const updatePostSchema = z.object({
  content: z.string().min(1).max(5000),
})

export type CreatePostInput = z.infer<typeof createPostSchema>
export type UpdatePostInput = z.infer<typeof updatePostSchema>

export function parseCreatePost(data: unknown): CreatePostInput {
  return createPostSchema.parse(data)
}

export function parseUpdatePost(data: unknown): UpdatePostInput {
  return updatePostSchema.parse(data)
}

export async function getPostByNumber(
  db: D1Database,
  boardId: string,
  threadId: string,
  postNumber: number,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
): Promise<Post | null> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return null
  // スレッド自体に読み取り権限がない場合は存在しないように見せる
  if (!hasPermission({ userId, userGroupIds, ownerUserId: thread.ownerUserId, ownerGroupId: thread.ownerGroupId, permissions: thread.permissions, operation: 'GET', isAdmin })) {
    return null
  }
  const post = await postRepository.findPostByNumber(db, threadId, postNumber)
  if (!post) return null
  // 投稿自体に読み取り権限がない場合は存在しないように見せる
  if (!isAdmin && !hasPermission({ userId, userGroupIds, ownerUserId: post.ownerUserId, ownerGroupId: post.ownerGroupId, permissions: post.permissions, operation: 'GET', isAdmin })) {
    return null
  }
  return post
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

  // 書き込み権限チェック: スレッドの POST パーミッション
  if (!hasPermission({ userId, userGroupIds, ownerUserId: thread.ownerUserId, ownerGroupId: thread.ownerGroupId, permissions: thread.permissions, operation: 'POST', isAdmin })) {
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
    ownerUserId: userId,              // 投稿者をオーナーに設定
    ownerGroupId: thread.ownerGroupId, // スレッドのグループを継承
    permissions: '10,10,10,8',         // GET: all, PUT: owner+group+auth, それ以外: anon=GETのみ
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

// 投稿の更新 (ソフト削除=削除マーク書き込みにも使用)
export async function updatePost(
  db: D1Database,
  boardId: string,
  threadId: string,
  postNumber: number,
  input: UpdatePostInput,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
): Promise<Post | null> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return null

  const post = await postRepository.findPostByNumber(db, threadId, postNumber)
  if (!post) return null

  // PUT パーミッションチェック (post 自身のパーミッションで確認)
  if (!hasPermission({
    userId, userGroupIds,
    ownerUserId: post.ownerUserId, ownerGroupId: post.ownerGroupId,
    permissions: post.permissions, operation: 'PUT', isAdmin,
  })) {
    throw new Error('FORBIDDEN')
  }

  await postRepository.updatePostContent(db, threadId, postNumber, input.content)
  return postRepository.findPostByNumber(db, threadId, postNumber)
}
