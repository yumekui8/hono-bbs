import { z } from 'zod'
import type { Post } from '../types'
import type { DbAdapter } from '../adapters/db'
import * as postRepository from '../repository/postRepository'
import * as threadRepository from '../repository/threadRepository'
import * as boardRepository from '../repository/boardRepository'
import { hasPermission, expandTemplate, isValidPermissions } from '../utils/permission'
import { computeDisplayUserId } from '../utils/hash'

const createPostSchema = z.object({
  content: z.string().min(1).max(10000),
  posterName: z.string().max(50).optional(),
  posterOptionInfo: z.string().max(100).optional(),
})

const updatePostSchema = z.object({
  content: z.string().min(1).max(10000),
  posterName: z.string().max(50).optional(),
  posterOptionInfo: z.string().max(100).optional(),
})

const patchPostSchema = z.object({
  administrators: z.string().max(500).optional(),
  members: z.string().max(500).optional(),
  permissions: z.string().refine(isValidPermissions, {
    message: 'permissions は "admins,members,users,anon" 形式で各値 0-31 の整数を指定してください',
  }).optional(),
})

export type CreatePostInput = z.infer<typeof createPostSchema>
export type UpdatePostInput = z.infer<typeof updatePostSchema>
export type PatchPostInput = z.infer<typeof patchPostSchema>

export function parseCreatePost(data: unknown): CreatePostInput {
  return createPostSchema.parse(data)
}

export function parseUpdatePost(data: unknown): UpdatePostInput {
  return updatePostSchema.parse(data)
}

export function parsePatchPost(data: unknown): PatchPostInput {
  return patchPostSchema.parse(data)
}

export async function getPostByNumber(
  db: DbAdapter,
  boardId: string,
  threadId: string,
  postNumber: number,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
): Promise<Post | null> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return null
  if (!hasPermission({
    userId, userRoleIds,
    administrators: thread.administrators, members: thread.members,
    permissions: thread.permissions, operation: 'GET', isSysAdmin,
  })) return null

  const post = await postRepository.findPostByNumber(db, threadId, postNumber)
  if (!post) return null
  if (!isSysAdmin && !hasPermission({
    userId, userRoleIds,
    administrators: post.administrators, members: post.members,
    permissions: post.permissions, operation: 'GET', isSysAdmin,
  })) return null

  return post
}

export async function createPost(
  db: DbAdapter,
  boardId: string,
  threadId: string,
  input: CreatePostInput,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
  sessionId: string | null,
  turnstileSessionId: string | null,
): Promise<Post> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) throw new Error('THREAD_NOT_FOUND')

  const board = await boardRepository.findBoardById(db, boardId)
  if (!board) throw new Error('BOARD_NOT_FOUND')

  if (!hasPermission({
    userId, userRoleIds,
    administrators: thread.administrators, members: thread.members,
    permissions: thread.permissions, operation: 'POST', isSysAdmin,
  })) throw new Error('FORBIDDEN')

  // 書き込み数上限チェック (0=無制限, スレッド設定→ボードデフォルト)
  const maxPosts = thread.maxPosts > 0 ? thread.maxPosts : board.defaultMaxPosts
  if (maxPosts > 0 && thread.postCount >= maxPosts) throw new Error('POST_LIMIT_REACHED')

  // 文字数・行数チェック
  const maxLength = thread.maxPostLength > 0 ? thread.maxPostLength : board.defaultMaxPostLength
  const maxLines = thread.maxPostLines > 0 ? thread.maxPostLines : board.defaultMaxPostLines
  if (maxLength > 0 && input.content.length > maxLength) throw new Error('CONTENT_TOO_LONG')
  if (maxLines > 0 && input.content.split('\n').length > maxLines) throw new Error('CONTENT_TOO_MANY_LINES')

  // IDフォーマット (スレッド設定 → ボードデフォルト)
  const idFormat = thread.idFormat || board.defaultIdFormat
  const authorId = await computeDisplayUserId(idFormat, userId, turnstileSessionId)

  // 投稿者名 (入力 → スレッドデフォルト → ボードデフォルト)
  const posterName = input.posterName || thread.posterName || board.defaultPosterName

  const now = new Date().toISOString()
  const postNumber = await postRepository.nextPostNumber(db, threadId)

  // レスの administrators/members を展開
  const postAdministrators = expandTemplate(board.defaultPostAdministrators, userId, thread.administrators)
  const postMembers = expandTemplate(board.defaultPostMembers, userId, thread.members)

  const post: Post = {
    id: crypto.randomUUID(),
    threadId,
    postNumber,
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

  await postRepository.insertPost(db, post)
  await threadRepository.incrementPostCount(db, threadId, now)

  return post
}

// PUT: content/posterName/posterOptionInfo を更新し isEdited フラグを立てる
export async function updatePost(
  db: DbAdapter,
  boardId: string,
  threadId: string,
  postNumber: number,
  input: UpdatePostInput,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
): Promise<Post | null> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return null

  const post = await postRepository.findPostByNumber(db, threadId, postNumber)
  if (!post) return null

  if (!hasPermission({
    userId, userRoleIds,
    administrators: post.administrators, members: post.members,
    permissions: post.permissions, operation: 'PUT', isSysAdmin,
  })) throw new Error('FORBIDDEN')

  const now = new Date().toISOString()
  await postRepository.updatePostContent(db, threadId, postNumber, input.content, now)
  return postRepository.findPostByNumber(db, threadId, postNumber)
}

// PATCH: administrators/members/permissions を更新
export async function patchPost(
  db: DbAdapter,
  boardId: string,
  threadId: string,
  postNumber: number,
  input: PatchPostInput,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
): Promise<Post | null> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return null

  const post = await postRepository.findPostByNumber(db, threadId, postNumber)
  if (!post) return null

  if (!hasPermission({
    userId, userRoleIds,
    administrators: post.administrators, members: post.members,
    permissions: post.permissions, operation: 'PATCH', isSysAdmin,
  })) throw new Error('FORBIDDEN')

  const administrators = input.administrators !== undefined
    ? expandTemplate(input.administrators, userId, post.administrators)
    : undefined

  await postRepository.patchPost(db, threadId, postNumber, {
    administrators,
    members: input.members,
    permissions: input.permissions,
  })
  return postRepository.findPostByNumber(db, threadId, postNumber)
}

// DELETE: ソフトデリート
export async function deletePost(
  db: DbAdapter,
  boardId: string,
  threadId: string,
  postNumber: number,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
): Promise<Post | null> {
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) return null

  const post = await postRepository.findPostByNumber(db, threadId, postNumber)
  if (!post) return null

  if (!hasPermission({
    userId, userRoleIds,
    administrators: post.administrators, members: post.members,
    permissions: post.permissions, operation: 'DELETE', isSysAdmin,
  })) throw new Error('FORBIDDEN')

  await postRepository.softDeletePost(db, threadId, postNumber)
  return postRepository.findPostByNumber(db, threadId, postNumber)
}
