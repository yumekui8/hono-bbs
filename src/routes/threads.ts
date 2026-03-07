import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getThreadsHandler,
  createThreadHandler,
  deleteThreadHandler,
} from '../handlers/threadHandler'
import { adminAuth } from '../middleware/adminAuth'

const threads = new Hono<AppEnv>()

threads.get('/', getThreadsHandler)
threads.post('/', createThreadHandler)
threads.delete('/:threadId', adminAuth, deleteThreadHandler)

export default threads
