import type { Context } from 'hono'
import { isZodError, zodMessage } from '../utils/zodHelper'
import type { AppEnv, Thread, Post } from '../types'
import * as threadService from '../services/threadService'
import { SYSTEM_USER_ADMIN_GROUP_ID, SYSTEM_BBS_ADMIN_GROUP_ID } from '../utils/constants'

function adminVisible(c: Context<AppEnv>): boolean {
  const groups = c.get('userGroupIds')
  return groups.includes(SYSTEM_USER_ADMIN_GROUP_ID) || groups.includes(SYSTEM_BBS_ADMIN_GROUP_ID)
}

function stripThread(thread: Thread, visible: boolean): Thread | Omit<Thread, 'adminMeta'> {
  if (visible) return thread
  const { adminMeta: _dropped, ...rest } = thread
  return rest
}

function stripPost(post: Post, visible: boolean): Post | Omit<Post, 'adminMeta'> {
  if (visible) return post
  const { adminMeta: _dropped, ...rest } = post
  return rest
}

export async function getThreadsHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const result = await threadService.getThreadsWithBoard(c.env.DB, boardId)
  if (!result) return c.json({ error: 'BOARD_NOT_FOUND', message: 'Board not found' }, 404)
  const visible = adminVisible(c)
  return c.json({
    data: {
      board: result.board,
      threads: result.threads.map(t => stripThread(t, visible)),
    },
  })
}

export async function getThreadWithPostsHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threadId = c.req.param('threadId')
  const result = await threadService.getThreadWithPosts(c.env.DB, boardId, threadId)
  if (!result) return c.json({ error: 'THREAD_NOT_FOUND', message: 'Thread not found' }, 404)
  const visible = adminVisible(c)
  return c.json({
    data: {
      thread: stripThread(result.thread, visible),
      posts: result.posts.map(p => stripPost(p, visible)),
    },
  })
}

export async function createThreadHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  try {
    const body = await c.req.json()
    const input = threadService.parseCreateThread(body)
    const result = await threadService.createThread(
      c.env.DB, boardId, input,
      c.get('userId'), c.get('userGroupIds'), c.get('isAdmin'),
      c.get('userToken'),
      c.req.header('X-Session-Id') ?? null,
      c.req.header('X-Turnstile-Session') ?? null,
    )
    const visible = adminVisible(c)
    return c.json({
      data: {
        thread: stripThread(result.thread, visible),
        firstPost: stripPost(result.firstPost, visible),
      },
    }, 201)
  } catch (e) {
    if (isZodError(e)) {
      return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    }
    if (e instanceof Error) {
      if (e.message === 'BOARD_NOT_FOUND') return c.json({ error: 'BOARD_NOT_FOUND', message: 'Board not found' }, 404)
      if (e.message === 'FORBIDDEN') return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
      if (e.message === 'THREAD_LIMIT_REACHED') return c.json({ error: 'THREAD_LIMIT_REACHED', message: 'Thread limit reached' }, 422)
      if (e.message === 'TITLE_TOO_LONG') return c.json({ error: 'TITLE_TOO_LONG', message: 'Thread title is too long' }, 422)
      if (e.message === 'CONTENT_TOO_LONG') return c.json({ error: 'CONTENT_TOO_LONG', message: 'Content is too long' }, 422)
      if (e.message === 'CONTENT_TOO_MANY_LINES') return c.json({ error: 'CONTENT_TOO_MANY_LINES', message: 'Content has too many lines' }, 422)
    }
    throw e
  }
}

export async function updateThreadHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threadId = c.req.param('threadId')
  try {
    const body = await c.req.json()
    const input = threadService.parseUpdateThread(body)
    const thread = await threadService.updateThread(
      c.env.DB, boardId, threadId, input,
      c.get('userId'), c.get('userGroupIds'), c.get('isAdmin'),
    )
    if (!thread) return c.json({ error: 'THREAD_NOT_FOUND', message: 'Thread not found' }, 404)
    return c.json({ data: stripThread(thread, adminVisible(c)) })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
    }
    throw e
  }
}

export async function deleteThreadHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threadId = c.req.param('threadId')
  try {
    const deleted = await threadService.deleteThread(
      c.env.DB, boardId, threadId,
      c.get('userId'), c.get('userGroupIds'), c.get('isAdmin'),
    )
    if (!deleted) return c.json({ error: 'THREAD_NOT_FOUND', message: 'Thread not found' }, 404)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
    }
    throw e
  }
}
