import type { Context } from 'hono'
import { ZodError } from 'zod'
import type { AppEnv } from '../types'
import * as threadService from '../services/threadService'

export async function getThreadsHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threads = await threadService.getThreadsByBoardId(c.env.DB, boardId)
  return c.json({ data: threads })
}

export async function createThreadHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const body = await c.req.json()
  try {
    const input = threadService.parseCreateThread(body)
    const thread = await threadService.createThread(c.env.DB, boardId, input)
    return c.json({ data: thread }, 201)
  } catch (e) {
    if (e instanceof ZodError) {
      return c.json({ error: 'VALIDATION_ERROR', message: e.errors[0].message }, 400)
    }
    if (e instanceof Error && e.message === 'BOARD_NOT_FOUND') {
      return c.json({ error: 'BOARD_NOT_FOUND', message: 'Board not found' }, 404)
    }
    throw e
  }
}

export async function deleteThreadHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const threadId = c.req.param('threadId')
  const deleted = await threadService.deleteThread(c.env.DB, boardId, threadId)
  if (!deleted) {
    return c.json({ error: 'THREAD_NOT_FOUND', message: 'Thread not found' }, 404)
  }
  return new Response(null, { status: 204 })
}
