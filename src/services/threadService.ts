import { z } from 'zod'
import type { Thread, Board, Post } from '../types'
import type { DbAdapter } from '../adapters/db'
import * as threadRepository from '../repository/threadRepository'
import * as boardRepository from '../repository/boardRepository'
import * as postRepository from '../repository/postRepository'
import type { PostRange } from '../repository/postRepository'

export type { PostRange }
import { hasPermission, expandTemplate, isValidPermissions } from '../utils/permission'
import { computeDisplayUserId } from '../utils/hash'

const ID_FORMATS = ['daily_hash', 'daily_hash_or_user', 'api_key_hash', 'api_key_hash_or_user', 'none'] as const

const createThreadSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(10000),
  posterName: z.string().max(50).optional(),
  posterOptionInfo: z.string().max(100).optional(),
})

// PUT: title と posterName のみ更新 (is_edited フラグを立てる)
const putThreadSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  posterName: z.string().max(50).optional(),
})

const permissionsField = z.string().refine(isValidPermissions, {
  message: 'permissions は "admins,members,users,anon" 形式で各値 0-31 の整数を指定してください',
})

// PATCH: administrators/members/permissions/制限値 などを更新
const patchThreadSchema = z.object({
  administrators: z.string().max(500).optional(),
  members: z.string().max(500).optional(),
  permissions: permissionsField.optional(),
  title: z.string().min(1).max(500).optional(),
  posterName: z.string().max(50).optional(),
  maxPosts: z.number().int().min(0).optional(),
  maxPostLength: z.number().int().min(0).optional(),
  maxPostLines: z.number().int().min(0).optional(),
  maxPosterNameLength: z.number().int().min(0).optional(),
  maxPosterOptionLength: z.number().int().min(0).optional(),
  idFormat: z.enum([...ID_FORMATS, '']).optional(),
})

export type CreateThreadInput = z.infer<typeof createThreadSchema>
export type PutThreadInput = z.infer<typeof putThreadSchema>
export type PatchThreadInput = z.infer<typeof patchThreadSchema>

export function parseCreateThread(data: unknown): CreateThreadInput {
  return createThreadSchema.parse(data)
}

export function parsePutThread(data: unknown): PutThreadInput {
  return putThreadSchema.parse(data)
}

export function parsePatchThread(data: unknown): PatchThreadInput {
  return patchThreadSchema.parse(data)
}

// 板情報とスレッド一覧を一緒に返す (GET /boards/:boardId)
export async function getThreadsWithBoard(
  db: DbAdapter,
  boardId: string,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
): Promise<{ board: Board; threads: Thread[] } | null> {
  const board = await boardRepository.findBoardById(db, boardId)
  if (!board) return null
  if (!hasPermission({
    userId, userRoleIds,
    administrators: board.administrators, members: board.members,
    permissions: board.permissions, operation: 'GET', isSysAdmin,
  })) return null

  const threads = await threadRepository.findThreadsByBoardId(db, boardId)
  if (isSysAdmin) return { board, threads }
  const filtered = threads.filter(t => hasPermission({
    userId, userRoleIds,
    administrators: t.administrators, members: t.members,
    permissions: t.permissions, operation: 'GET', isSysAdmin,
  }))
  return { board, threads: filtered }
}

// スレッド情報と投稿一覧を一緒に返す (GET /boards/:boardId/:threadId)
export async function getThreadWithPosts(
  db: DbAdapter,
  boardId: string,
  threadId: string,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
  ranges?: PostRange[],
): Promise<{ thread: Thread; posts: Post[] } | null> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return null
  if (!hasPermission({
    userId, userRoleIds,
    administrators: thread.administrators, members: thread.members,
    permissions: thread.permissions, operation: 'GET', isSysAdmin,
  })) return null

  const posts = ranges
    ? await postRepository.findPostsByRanges(db, threadId, ranges)
    : await postRepository.findPostsByThreadId(db, threadId)
  if (isSysAdmin) return { thread, posts }
  const filtered = posts.filter(p => hasPermission({
    userId, userRoleIds,
    administrators: p.administrators, members: p.members,
    permissions: p.permissions, operation: 'GET', isSysAdmin,
  }))
  return { thread, posts: filtered }
}

export async function createThread(
  db: DbAdapter,
  boardId: string,
  input: CreateThreadInput,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
  sessionId: string | null,
  turnstileSessionId: string | null,
): Promise<{ thread: Thread; firstPost: Post }> {
  const board = await boardRepository.findBoardById(db, boardId)
  if (!board) throw new Error('BOARD_NOT_FOUND')

  if (!hasPermission({
    userId, userRoleIds,
    administrators: board.administrators, members: board.members,
    permissions: board.permissions, operation: 'POST', isSysAdmin,
  })) throw new Error('FORBIDDEN')

  // スレッド数上限チェック (0=無制限)
  if (board.maxThreads > 0) {
    const existing = await threadRepository.findThreadsByBoardId(db, boardId)
    if (existing.length >= board.maxThreads) throw new Error('THREAD_LIMIT_REACHED')
  }

  // タイトル長チェック
  if (board.maxThreadTitleLength > 0 && input.title.length > board.maxThreadTitleLength) {
    throw new Error('TITLE_TOO_LONG')
  }

  // 本文の文字数・行数チェック (board デフォルト値で)
  if (board.defaultMaxPostLength > 0 && input.content.length > board.defaultMaxPostLength) {
    throw new Error('CONTENT_TOO_LONG')
  }
  if (board.defaultMaxPostLines > 0 && input.content.split('\n').length > board.defaultMaxPostLines) {
    throw new Error('CONTENT_TOO_MANY_LINES')
  }

  const now = new Date().toISOString()

  // スレッドの administrators/members を展開 ($CREATOR → 作成者, $PARENTS → 板のadministrators)
  const threadAdministrators = expandTemplate(board.defaultThreadAdministrators, userId, board.administrators)
  const threadMembers = expandTemplate(board.defaultThreadMembers, userId, board.members)

  const thread: Thread = {
    id: crypto.randomUUID(),
    boardId,
    administrators: threadAdministrators,
    members: threadMembers,
    permissions: board.defaultThreadPermissions,
    title: input.title,
    maxPosts: 0,
    maxPostLength: 0,
    maxPostLines: 0,
    maxPosterNameLength: 0,
    maxPosterOptionLength: 0,
    posterName: '',
    idFormat: '',
    postCount: 1,
    isEdited: false,
    editedAt: null,
    createdAt: now,
    updatedAt: now,
    adminMeta: { creatorUserId: userId, creatorSessionId: sessionId, creatorTurnstileSessionId: turnstileSessionId },
  }
  await threadRepository.insertThread(db, thread)

  // 第1レスを作成
  const idFormat = board.defaultIdFormat
  const authorId = await computeDisplayUserId(idFormat, userId, turnstileSessionId)
  const posterName = input.posterName ?? board.defaultPosterName

  // レスの administrators/members を展開 ($PARENTS → スレッドのadministrators)
  const postAdministrators = expandTemplate(board.defaultPostAdministrators, userId, threadAdministrators)
  const postMembers = expandTemplate(board.defaultPostMembers, userId, threadMembers)

  const firstPost: Post = {
    id: crypto.randomUUID(),
    threadId: thread.id,
    postNumber: 1,
    administrators: postAdministrators,
    members: postMembers,
    permissions: board.defaultPostPermissions,
    authorId,
    posterName,
    posterOptionInfo: input.posterOptionInfo ?? '',
    content: input.content,
    isDeleted: false,
    isEdited: false,
    editedAt: null,
    createdAt: now,
    adminMeta: { creatorUserId: userId, creatorSessionId: sessionId, creatorTurnstileSessionId: turnstileSessionId },
  }
  await postRepository.insertPost(db, firstPost)

  return { thread, firstPost }
}

// PUT: title/posterName を更新し isEdited フラグを立てる
export async function putThread(
  db: DbAdapter,
  boardId: string,
  threadId: string,
  input: PutThreadInput,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
): Promise<Thread | null> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return null

  if (!hasPermission({
    userId, userRoleIds,
    administrators: thread.administrators, members: thread.members,
    permissions: thread.permissions, operation: 'PUT', isSysAdmin,
  })) throw new Error('FORBIDDEN')

  const now = new Date().toISOString()
  await threadRepository.updateThread(db, threadId, {
    title: input.title,
    posterName: input.posterName,
    isEdited: true,
    editedAt: now,
  })
  return threadRepository.findThreadById(db, threadId)
}

// PATCH: メタデータ全般を更新
export async function patchThread(
  db: DbAdapter,
  boardId: string,
  threadId: string,
  input: PatchThreadInput,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
  sessionId: string | null,
  turnstileSessionId: string | null,
): Promise<Thread> {
  const existing = await threadRepository.findThreadById(db, threadId)

  if (!existing) {
    // スレッドが存在しない場合: sys admin のみ作成可
    if (!isSysAdmin) throw new Error('FORBIDDEN')
    const board = await boardRepository.findBoardById(db, boardId)
    if (!board) throw new Error('BOARD_NOT_FOUND')
    const now = new Date().toISOString()
    const administrators = expandTemplate(
      input.administrators ?? board.defaultThreadAdministrators,
      userId,
      board.administrators,
    )
    const members = expandTemplate(
      input.members ?? board.defaultThreadMembers,
      userId,
      board.members,
    )
    const thread: Thread = {
      id: threadId,
      boardId,
      administrators,
      members,
      permissions: input.permissions ?? board.defaultThreadPermissions,
      title: input.title ?? '',
      maxPosts: input.maxPosts ?? 0,
      maxPostLength: input.maxPostLength ?? 0,
      maxPostLines: input.maxPostLines ?? 0,
      maxPosterNameLength: input.maxPosterNameLength ?? 0,
      maxPosterOptionLength: input.maxPosterOptionLength ?? 0,
      posterName: input.posterName ?? '',
      idFormat: input.idFormat ?? '',
      postCount: 0,
      isEdited: false,
      editedAt: null,
      createdAt: now,
      updatedAt: now,
      adminMeta: { creatorUserId: userId, creatorSessionId: sessionId, creatorTurnstileSessionId: turnstileSessionId },
    }
    await threadRepository.insertThread(db, thread)
    return thread
  }

  if (!hasPermission({
    userId, userRoleIds,
    administrators: existing.administrators, members: existing.members,
    permissions: existing.permissions, operation: 'PATCH', isSysAdmin,
  })) throw new Error('FORBIDDEN')

  const administrators = input.administrators !== undefined
    ? expandTemplate(input.administrators, userId, existing.administrators)
    : undefined

  await threadRepository.updateThread(db, threadId, {
    administrators,
    members: input.members,
    permissions: input.permissions,
    title: input.title,
    posterName: input.posterName,
    maxPosts: input.maxPosts,
    maxPostLength: input.maxPostLength,
    maxPostLines: input.maxPostLines,
    maxPosterNameLength: input.maxPosterNameLength,
    maxPosterOptionLength: input.maxPosterOptionLength,
    idFormat: input.idFormat,
  })
  return (await threadRepository.findThreadById(db, threadId))!
}

export async function deleteThread(
  db: DbAdapter,
  boardId: string,
  threadId: string,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
): Promise<boolean> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return false

  if (!hasPermission({
    userId, userRoleIds,
    administrators: thread.administrators, members: thread.members,
    permissions: thread.permissions, operation: 'DELETE', isSysAdmin,
  })) throw new Error('FORBIDDEN')

  return threadRepository.deleteThread(db, threadId)
}
