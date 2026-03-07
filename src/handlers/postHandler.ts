import type { Context } from 'hono'
import { ZodError } from 'zod'
import type { AppEnv } from '../types'
import * as postService from '../services/postService'

export async function getPostsHandler(c: Context<AppEnv>): Promise<Response> {
  const threadId = c.req.param('threadId')
  const posts = await postService.getPostsByThreadId(c.env.DB, threadId)
  return c.json({ data: posts })
}

export async function createPostHandler(c: Context<AppEnv>): Promise<Response> {
  const threadId = c.req.param('threadId')
  const body = await c.req.json()
  try {
    const input = postService.parseCreatePost(body)
    const post = await postService.createPost(c.env.DB, threadId, input)
    return c.json({ data: post }, 201)
  } catch (e) {
    if (e instanceof ZodError) {
      return c.json({ error: 'VALIDATION_ERROR', message: e.errors[0].message }, 400)
    }
    if (e instanceof Error && e.message === 'THREAD_NOT_FOUND') {
      return c.json({ error: 'THREAD_NOT_FOUND', message: 'Thread not found' }, 404)
    }
    throw e
  }
}

export async function deletePostHandler(c: Context<AppEnv>): Promise<Response> {
  const threadId = c.req.param('threadId')
  const postId = c.req.param('postId')
  const deleted = await postService.deletePost(c.env.DB, threadId, postId)
  if (!deleted) {
    return c.json({ error: 'POST_NOT_FOUND', message: 'Post not found' }, 404)
  }
  return new Response(null, { status: 204 })
}
