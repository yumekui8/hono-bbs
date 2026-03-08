import type { Context } from 'hono'
import type { AppEnv, Post } from '../types'
import * as postService from '../services/postService'
import { isZodError, zodMessage } from '../utils/zodHelper'
import { SYSTEM_USER_ADMIN_GROUP_ID, SYSTEM_BBS_ADMIN_GROUP_ID } from '../utils/constants'

function adminVisible(c: Context<AppEnv>): boolean {
  const groups = c.get('userGroupIds')
  return groups.includes(SYSTEM_USER_ADMIN_GROUP_ID) || groups.includes(SYSTEM_BBS_ADMIN_GROUP_ID)
}

function stripPost(post: Post, visible: boolean): Post | Omit<Post, 'adminMeta'> {
  if (visible) return post
  const { adminMeta: _dropped, ...rest } = post
  return rest
}

export async function getPostsHandler(c: Context<AppEnv>): Promise<Response> {
  const threadId = c.req.param('threadId')
  const posts = await postService.getPostsByThreadId(c.env.DB, threadId)
  const visible = adminVisible(c)
  return c.json({ data: posts.map(p => stripPost(p, visible)) })
}

export async function createPostHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threadId = c.req.param('threadId')
  try {
    const body = await c.req.json()
    const input = postService.parseCreatePost(body)
    const post = await postService.createPost(
      c.env.DB, boardId, threadId, input,
      c.get('userId'), c.get('userGroupIds'), c.get('isAdmin'),
      c.req.header('X-Session-Id') ?? null,
      c.req.header('X-Turnstile-Session') ?? null,
    )
    return c.json({ data: stripPost(post, adminVisible(c)) }, 201)
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

export async function deletePostHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threadId = c.req.param('threadId')
  const postId = c.req.param('postId')
  try {
    const deleted = await postService.deletePost(
      c.env.DB, boardId, threadId, postId,
      c.get('userId'), c.get('userGroupIds'), c.get('isAdmin'),
    )
    if (!deleted) return c.json({ error: 'POST_NOT_FOUND', message: 'Post not found' }, 404)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
    }
    throw e
  }
}
