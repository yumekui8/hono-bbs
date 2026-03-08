import { Hono } from 'hono'
import type { AppEnv } from './types'
import { authContext } from './middleware/auth'
import auth from './routes/auth'
import identity from './routes/identity'
import boards from './routes/boards'
import threads from './routes/threads'
import posts from './routes/posts'

// 内部ルーター (ベースパスなし)
const api = new Hono<AppEnv>()

// 全ルートに認証コンテキストを適用
api.use('*', authContext)

api.route('/auth', auth)
api.route('/identity', identity)
api.route('/boards', boards)
api.route('/boards/:boardId/threads', threads)
api.route('/boards/:boardId/threads/:threadId/posts', posts)

// グローバルエラーハンドラー
api.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'INTERNAL_SERVER_ERROR', message: 'An error occurred' }, 500)
})

// API_BASE_PATH を env から動的に読み取り、URLのプレフィックスを除去して内部ルーターに転送
export default {
  async fetch(request: Request, env: AppEnv['Bindings'], ctx: ExecutionContext): Promise<Response> {
    const basePath = env.API_BASE_PATH ?? '/api/v1'
    const url = new URL(request.url)

    if (!url.pathname.startsWith(basePath)) {
      return Response.json(
        { error: 'NOT_FOUND', message: `API base path is ${basePath}` },
        { status: 404 },
      )
    }

    // ベースパスを除去して内部ルーターに転送
    const newPath = url.pathname.slice(basePath.length) || '/'
    url.pathname = newPath
    return api.fetch(new Request(url.toString(), request), env, ctx)
  },
}
