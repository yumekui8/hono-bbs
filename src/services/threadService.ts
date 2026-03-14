import { z } from 'zod'
import type { Thread, Board, Post } from '../types'
import * as threadRepository from '../repository/threadRepository'
import * as boardRepository from '../repository/boardRepository'
import * as postRepository from '../repository/postRepository'
import { hasPermission } from '../utils/permission'
import { computeDisplayUserId } from '../utils/hash'

const createThreadSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  posterName: z.string().max(50).optional(),
  posterSubInfo: z.string().max(100).optional(),
})

const updateThreadSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  maxPosts: z.number().int().min(1).nullable().optional(),
  posterName: z.string().max(50).nullable().optional(),
  idFormat: z.enum(['daily_hash', 'daily_hash_or_user', 'api_key_hash', 'api_key_hash_or_user', 'none']).nullable().optional(),
})

export type CreateThreadInput = z.infer<typeof createThreadSchema>
export type UpdateThreadInput = z.infer<typeof updateThreadSchema>

export function parseCreateThread(data: unknown): CreateThreadInput {
  return createThreadSchema.parse(data)
}

export function parseUpdateThread(data: unknown): UpdateThreadInput {
  return updateThreadSchema.parse(data)
}

// 板情報とスレッド一覧を一緒に返す (GET /boards/:boardId)
// 読み取り権限のないスレッドは除外される
export async function getThreadsWithBoard(
  db: D1Database,
  boardId: string,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
): Promise<{ board: Board; threads: Thread[] } | null> {
  const board = await boardRepository.findBoardById(db, boardId)
  if (!board) return null
  // 板自体に読み取り権限がない場合は存在しないように見せる
  if (!hasPermission({ userId, userGroupIds, ownerUserId: board.ownerUserId, ownerGroupId: board.ownerGroupId, permissions: board.permissions, operation: 'GET', isAdmin })) {
    return null
  }
  const threads = await threadRepository.findThreadsByBoardId(db, boardId)
  if (isAdmin) return { board, threads }
  // 読み取り権限のないスレッドを除外
  const filtered = threads.filter(t => hasPermission({
    userId, userGroupIds,
    ownerUserId: t.ownerUserId, ownerGroupId: t.ownerGroupId,
    permissions: t.permissions, operation: 'GET', isAdmin,
  }))
  return { board, threads: filtered }
}

// スレッド情報と投稿一覧を一緒に返す (GET /boards/:boardId/:threadId)
// 読み取り権限のない投稿は除外される
export async function getThreadWithPosts(
  db: D1Database,
  boardId: string,
  threadId: string,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
): Promise<{ thread: Thread; posts: Post[] } | null> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return null
  // スレッド自体に読み取り権限がない場合は存在しないように見せる
  if (!hasPermission({ userId, userGroupIds, ownerUserId: thread.ownerUserId, ownerGroupId: thread.ownerGroupId, permissions: thread.permissions, operation: 'GET', isAdmin })) {
    return null
  }
  const posts = await postRepository.findPostsByThreadId(db, threadId)
  if (isAdmin) return { thread, posts }
  // 読み取り権限のない投稿を除外
  const filtered = posts.filter(p => hasPermission({
    userId, userGroupIds,
    ownerUserId: p.ownerUserId, ownerGroupId: p.ownerGroupId,
    permissions: p.permissions, operation: 'GET', isAdmin,
  }))
  return { thread, posts: filtered }
}

export async function createThread(
  db: D1Database,
  boardId: string,
  input: CreateThreadInput,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
  sessionId: string | null,
  turnstileSessionId: string | null,
): Promise<{ thread: Thread; firstPost: Post }> {
  const board = await boardRepository.findBoardById(db, boardId)
  if (!board) throw new Error('BOARD_NOT_FOUND')

  // スレッド作成 = POST /boards/:boardId → 板の POST パーミッション確認
  if (!hasPermission({ userId, userGroupIds, ownerUserId: board.ownerUserId, ownerGroupId: board.ownerGroupId, permissions: board.permissions, operation: 'POST', isAdmin })) {
    throw new Error('FORBIDDEN')
  }

  // スレッド数上限チェック
  const existing = await threadRepository.findThreadsByBoardId(db, boardId)
  if (existing.length >= board.maxThreads) throw new Error('THREAD_LIMIT_REACHED')

  // タイトル長チェック
  if (input.title.length > board.maxThreadTitleLength) throw new Error('TITLE_TOO_LONG')

  // 本文の文字数・行数チェック
  const maxLength = board.defaultMaxPostLength
  const maxLines = board.defaultMaxPostLines
  if (input.content.length > maxLength) throw new Error('CONTENT_TOO_LONG')
  if (input.content.split('\n').length > maxLines) throw new Error('CONTENT_TOO_MANY_LINES')

  const now = new Date().toISOString()

  // スレッドを post_count: 1 で作成 (ownerGroupId はスレッドのデフォルトグループを設定)
  const threadOwnerGroupId = board.defaultThreadOwnerGroupId ?? board.ownerGroupId
  const thread: Thread = {
    id: crypto.randomUUID(),
    boardId,
    ownerUserId: board.defaultThreadOwnerUserId ?? userId,
    ownerGroupId: threadOwnerGroupId,
    permissions: board.defaultThreadPermissions,
    title: input.title,
    maxPosts: null,
    maxPostLength: null,
    maxPostLines: null,
    maxPosterNameLength: null,
    maxPosterSubInfoLength: null,
    maxPosterMetaInfoLength: null,
    posterName: null,
    idFormat: null,  // 板のデフォルトを継承
    postCount: 1,
    createdAt: now,
    updatedAt: now,
    adminMeta: { creatorUserId: userId, creatorSessionId: sessionId, creatorTurnstileSessionId: turnstileSessionId },
  }
  await threadRepository.insertThread(db, thread)

  // 第1レスを作成
  const idFormat = board.defaultIdFormat
  const displayUserId = await computeDisplayUserId(idFormat, userId, turnstileSessionId)
  const posterName = input.posterName ?? board.defaultPosterName

  const firstPost: Post = {
    id: crypto.randomUUID(),
    threadId: thread.id,
    postNumber: 1,
    ownerUserId: userId,          // 投稿者をオーナーに設定
    ownerGroupId: threadOwnerGroupId,  // スレッドのグループを継承
    permissions: '10,10,10,8',   // GET: all, PUT: owner+group+auth, それ以外: anon=GETのみ
    userId,
    displayUserId,
    posterName,
    posterSubInfo: input.posterSubInfo ?? null,
    content: input.content,
    createdAt: now,
    adminMeta: { creatorUserId: userId, creatorSessionId: sessionId, creatorTurnstileSessionId: turnstileSessionId },
  }
  await postRepository.insertPost(db, firstPost)

  return { thread, firstPost }
}

export async function updateThread(
  db: D1Database,
  boardId: string,
  threadId: string,
  input: UpdateThreadInput,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
): Promise<Thread | null> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return null

  if (!hasPermission({ userId, userGroupIds, ownerUserId: thread.ownerUserId, ownerGroupId: thread.ownerGroupId, permissions: thread.permissions, operation: 'PUT', isAdmin })) {
    throw new Error('FORBIDDEN')
  }

  await threadRepository.updateThread(db, threadId, input)
  return threadRepository.findThreadById(db, threadId)
}

export async function deleteThread(
  db: D1Database,
  boardId: string,
  threadId: string,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
): Promise<boolean> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return false

  if (!hasPermission({ userId, userGroupIds, ownerUserId: thread.ownerUserId, ownerGroupId: thread.ownerGroupId, permissions: thread.permissions, operation: 'DELETE', isAdmin })) {
    throw new Error('FORBIDDEN')
  }

  return threadRepository.deleteThread(db, threadId)
}
