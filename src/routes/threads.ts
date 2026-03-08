import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getThreadsHandler,
  getThreadWithPostsHandler,
  createThreadHandler,
  updateThreadHandler,
  deleteThreadHandler,
} from '../handlers/threadHandler'
import { requireLogin } from '../middleware/auth'
import { requireTurnstile } from '../middleware/turnstile'

const threads = new Hono<AppEnv>()

threads.get('/', getThreadsHandler)
threads.get('/:threadId', getThreadWithPostsHandler)
threads.post('/', requireTurnstile, createThreadHandler)
threads.put('/:threadId', requireLogin, requireTurnstile, updateThreadHandler)
threads.delete('/:threadId', requireLogin, requireTurnstile, deleteThreadHandler)

export default threads
