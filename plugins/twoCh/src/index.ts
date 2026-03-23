import { Hono } from 'hono'
import { trimTrailingSlash } from 'hono/trailing-slash'
import type { Env } from './types'
import { setupAdapters } from './middleware/adapters'
import { bbsmenuHandler, subjectTxtHandler, datHandler, settingTxtHandler, writeCgiHandler, twoChTurnstilePageHandler, twoChTurnstileVerifyHandler } from './handler'

const app = new Hono<Env>()
app.use(trimTrailingSlash())
app.use('*', setupAdapters)

// Turnstile 認証ページ (edge-token 方式)
app.get('/auth/turnstile', twoChTurnstilePageHandler)
app.post('/auth/turnstile', twoChTurnstileVerifyHandler)

// 板一覧
app.get('/bbsmenu.html', bbsmenuHandler)

// スレッド一覧 (Shift-JIS)
app.get('/:board/subject.txt', subjectTxtHandler)

// dat ファイル (Shift-JIS)
// thread_key は UNIX 時間 (10桁整数)
app.get('/:board/dat/:file', datHandler)

// 板設定 (2ch ブラウザがデフォルト名・文字数制限等を取得するために参照)
app.get('/:board/SETTING.TXT', settingTxtHandler)

// 書き込み (Shift-JIS フォームを受け付ける)
app.post('/test/bbs.cgi', writeCgiHandler)

app.onError((err, c) => {
  console.error('[twoCh error]', err)
  return new Response('Internal Server Error', { status: 500 })
})

export default {
  async fetch(request: Request, env: Env['Bindings'], ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx)
  },
}
