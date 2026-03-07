import { Hono } from 'hono'
import type { AppEnv } from './types'
import boards from './routes/boards'
import threads from './routes/threads'
import posts from './routes/posts'

const app = new Hono<AppEnv>()

app.route('/boards', boards)
app.route('/boards/:boardId/threads', threads)
app.route('/boards/:boardId/threads/:threadId/posts', posts)

// グローバルエラーハンドラー
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'INTERNAL_SERVER_ERROR', message: 'An error occurred' }, 500)
})

export default app
