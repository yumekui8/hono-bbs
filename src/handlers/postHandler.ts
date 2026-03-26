import type { Context } from 'hono'
import type { AppEnv, Post } from '../types'
import * as postService from '../services/postService'
import { isZodError, zodMessage } from '../utils/zodHelper'

function adminVisible(c: Context<AppEnv>): boolean {
  return c.get('isSysAdmin') || c.get('isUserAdmin')
}

// 削除済み投稿のコンテンツをマスク (poster_name / content を置換)
function maskDeletedPost(post: Post, deletedPosterName: string, deletedContent: string): Post {
  if (!post.isDeleted) return post
  return { ...post, posterName: deletedPosterName, posterOptionInfo: '', content: deletedContent }
}

function stripPost(post: Post, visible: boolean, deletedPosterName: string, deletedContent: string): Post | Omit<Post, 'adminMeta'> {
  const masked = maskDeletedPost(post, deletedPosterName, deletedContent)
  if (visible) return masked
  const { adminMeta: _dropped, ...rest } = masked
  return rest
}

// GET /boards/:boardId/:threadId/:responseNumber - 特定の投稿を取得
export async function getPostHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threadId = c.req.param('threadId')
  const responseNumber = parseInt(c.req.param('responseNumber'), 10)
  if (isNaN(responseNumber) || responseNumber < 1) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'responseNumber must be a positive integer' }, 400)
  }
  const post = await postService.getPostByNumber(
    c.get('db'), boardId, threadId, responseNumber,
    c.get('userId'), c.get('userRoleIds'), c.get('isSysAdmin'),
  )
  if (!post) return c.json({ error: 'POST_NOT_FOUND', message: 'Post not found' }, 404)
  const dn = c.env.DELETED_POSTER_NAME ?? ''
  const dc = c.env.DELETED_CONTENT    ?? ''
  return c.json({ data: stripPost(post, adminVisible(c), dn, dc) })
}

// POST /boards/:boardId/:threadId - 投稿作成
export async function createPostHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threadId = c.req.param('threadId')
  try {
    const body = await c.req.json()
    const input = postService.parseCreatePost(body)
    const post = await postService.createPost(
      c.get('db'), boardId, threadId, input,
      c.get('userId'), c.get('userRoleIds'), c.get('isSysAdmin'),
      c.req.header('X-Session-Id') ?? null,
      c.req.header('X-Turnstile-Session') ?? null,
    )
    const dn = c.env.DELETED_POSTER_NAME ?? 'あぼーん'
    const dc = c.env.DELETED_CONTENT    ?? 'このレスは削除されました'
    return c.json({ data: stripPost(post, adminVisible(c), dn, dc) }, 201)
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error) {
      if (e.message === 'THREAD_NOT_FOUND') return c.json({ error: 'THREAD_NOT_FOUND', message: 'Thread not found' }, 404)
      if (e.message === 'FORBIDDEN') return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
      if (e.message === 'POST_LIMIT_REACHED') return c.json({ error: 'POST_LIMIT_REACHED', message: 'Post limit reached' }, 422)
      if (e.message === 'CONTENT_TOO_LONG') return c.json({ error: 'CONTENT_TOO_LONG', message: 'Content is too long' }, 422)
      if (e.message === 'CONTENT_TOO_MANY_LINES') return c.json({ error: 'CONTENT_TOO_MANY_LINES', message: 'Content has too many lines' }, 422)
    }
    throw e
  }
}

// PUT /boards/:boardId/:threadId/:responseNumber - 投稿内容更新 + isEdited フラグ
export async function putPostHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threadId = c.req.param('threadId')
  const responseNumber = parseInt(c.req.param('responseNumber'), 10)
  if (isNaN(responseNumber) || responseNumber < 1) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'responseNumber must be a positive integer' }, 400)
  }
  try {
    const body = await c.req.json()
    const input = postService.parseUpdatePost(body)
    const post = await postService.updatePost(
      c.get('db'), boardId, threadId, responseNumber, input,
      c.get('userId'), c.get('userRoleIds'), c.get('isSysAdmin'),
    )
    if (!post) return c.json({ error: 'POST_NOT_FOUND', message: 'Post not found' }, 404)
    const dn = c.env.DELETED_POSTER_NAME ?? 'あぼーん'
    const dc = c.env.DELETED_CONTENT    ?? 'このレスは削除されました'
    return c.json({ data: stripPost(post, adminVisible(c), dn, dc) })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
    }
    throw e
  }
}

// PATCH /boards/:boardId/:threadId/:responseNumber - 投稿メタデータ更新
export async function patchPostHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threadId = c.req.param('threadId')
  const responseNumber = parseInt(c.req.param('responseNumber'), 10)
  if (isNaN(responseNumber) || responseNumber < 1) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'responseNumber must be a positive integer' }, 400)
  }
  try {
    const body = await c.req.json()
    const input = postService.parsePatchPost(body)
    const post = await postService.patchPost(
      c.get('db'), boardId, threadId, responseNumber, input,
      c.get('userId'), c.get('userRoleIds'), c.get('isSysAdmin'),
    )
    if (!post) return c.json({ error: 'POST_NOT_FOUND', message: 'Post not found' }, 404)
    const dn = c.env.DELETED_POSTER_NAME ?? 'あぼーん'
    const dc = c.env.DELETED_CONTENT    ?? 'このレスは削除されました'
    return c.json({ data: stripPost(post, adminVisible(c), dn, dc) })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
    }
    throw e
  }
}

// DELETE /boards/:boardId/:threadId/:responseNumber - 投稿ソフト削除
export async function deletePostHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threadId = c.req.param('threadId')
  const responseNumber = parseInt(c.req.param('responseNumber'), 10)
  if (isNaN(responseNumber) || responseNumber < 1) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'responseNumber must be a positive integer' }, 400)
  }
  try {
    const post = await postService.deletePost(
      c.get('db'), boardId, threadId, responseNumber,
      c.get('userId'), c.get('userRoleIds'), c.get('isSysAdmin'),
    )
    if (!post) return c.json({ error: 'POST_NOT_FOUND', message: 'Post not found' }, 404)
    const dn = c.env.DELETED_POSTER_NAME ?? 'あぼーん'
    const dc = c.env.DELETED_CONTENT    ?? 'このレスは削除されました'
    return c.json({ data: stripPost(post, adminVisible(c), dn, dc) })
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
    }
    throw e
  }
}
