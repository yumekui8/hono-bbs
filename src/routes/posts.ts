import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { createPostHandler, deletePostHandler } from '../handlers/postHandler'
import { requireTurnstile } from '../middleware/turnstile'

const posts = new Hono<AppEnv>()

// GET / は GET /boards/:boardId/threads/:threadId に統合されたため削除
posts.post('/', requireTurnstile, createPostHandler)
posts.delete('/:postId', requireTurnstile, deletePostHandler)

export default posts
