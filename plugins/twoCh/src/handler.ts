import type { Context } from 'hono'
import type { Env, BoardRow, PostRow, ThreadRow } from './types'
import type { DbAdapter } from './adapters/db'
import type { KvAdapter } from './adapters/kv'
import { toShiftJis, parseSjisForm } from './encode'
import { datLine, subjectLine, buildBbsMenu } from './formatter'

// Cookie ヘッダーから指定したキーの値を取り出す
function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

// SESSION_KV の edge_token:{uuid} エントリを確認し、認証済みなら true を返す
// eddiner 方式: 専用ブラウザが Set-Cookie で受け取った UUID をブラウザ認証後に有効化する
async function checkEdgeToken(kv: KvAdapter, uuid: string): Promise<boolean> {
  const data = await kv.get<{ authed: boolean; expiresAt: string }>('edge_token:' + uuid, 'json')
  if (!data) return false
  if (new Date(data.expiresAt) < new Date()) {
    await kv.delete('edge_token:' + uuid)
    return false
  }
  return data.authed === true
}

// edge-token チャレンジレスポンス (専用ブラウザ向け)
// UUID を発行して KV に未認証状態で保存し、Set-Cookie + 認証 URL を返す
// ユーザがブラウザで認証 URL を開いて Turnstile を通過すると KV が認証済みに更新される
// siteUrl: このWorkerのベースURL (SITE_URL 環境変数。末尾スラッシュなし)
async function edgeTokenChallenge(kv: KvAdapter, siteUrl: string): Promise<Response> {
  const uuid      = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  await kv.put('edge_token:' + uuid, JSON.stringify({ authed: false, expiresAt }), {
    expirationTtl: 86400, // 24 時間
  })
  const authUrl = siteUrl
    ? `${siteUrl}/auth/turnstile?edge_token=${uuid}`
    : `(SITE_URL 未設定) /auth/turnstile?edge_token=${uuid}`
  const html =
    `<html><!-- 2ch_X:error --><head><meta http-equiv="Content-Type" content="text/html; charset=x-sjis"><title>ＥＲＲＯＲ</title></head><body>` +
    `書き込む前に認証が必要です。<br>以下のURLにブラウザでアクセスして認証を行ってください：<br><a href="${authUrl}">${authUrl}</a><br><br>` +
    `認証完了後、再度書き込みを行ってください。` +
    `<br></body></html>`
  return new Response(toShiftJis(html), {
    headers: {
      'Content-Type': 'text/html; charset=x-sjis',
      'Set-Cookie':   `edge-token=${uuid}; Path=/; SameSite=Lax; Max-Age=86400`,
    },
  })
}

// GET /auth/turnstile - Turnstile 認証ウィジェットページ
export async function twoChTurnstilePageHandler(c: Context<Env>): Promise<Response> {
  const siteKey   = c.env.TURNSTILE_SITE_KEY ?? ''
  const edgeToken = c.req.query('edge_token') ?? ''
  const edgeTokenJs = JSON.stringify(edgeToken)

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>書き込み認証</title>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <style>
    body { font-family: sans-serif; max-width: 480px; margin: 60px auto; padding: 0 16px; }
    h1 { font-size: 1.2rem; }
    #status { margin: 16px 0; color: #555; }
    .error { color: #d00; }
  </style>
</head>
<body>
  <h1>書き込み認証</h1>
  <p id="status">チャレンジを完了してください。</p>
  <div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onSuccess"></div>
  <script>
    const edgeToken = ${edgeTokenJs};
    const postEndpoint = ${JSON.stringify(c.req.url.split('?')[0])};
    let submitted = false;
    async function onSuccess(token) {
      if (submitted) return;
      submitted = true;
      document.getElementById('status').textContent = '検証中...';
      try {
        const res = await fetch(postEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, edge_token: edgeToken })
        });
        const data = await res.json();
        if (data.ok) {
          document.getElementById('status').textContent = '認証完了！再度書き込みを行ってください。';
        } else {
          document.getElementById('status').innerHTML =
            '<span class="error">認証に失敗しました: ' + (data.error ?? 'unknown') + '</span>';
          submitted = false;
        }
      } catch (e) {
        document.getElementById('status').innerHTML =
          '<span class="error">通信エラーが発生しました</span>';
        submitted = false;
      }
    }
  </script>
</body>
</html>`
  return c.html(html)
}

// POST /auth/turnstile - Turnstile トークン検証 → edge-token を認証済みに更新
export async function twoChTurnstileVerifyHandler(c: Context<Env>): Promise<Response> {
  const body = await c.req.json<{ token?: string; edge_token?: string }>()

  if (!body.token || !body.edge_token) {
    return c.json({ ok: false, error: 'VALIDATION_ERROR' }, 400)
  }

  const secretKey = c.env.TURNSTILE_SECRET_KEY
  if (!secretKey) {
    console.error('[twoCh Turnstile] TURNSTILE_SECRET_KEY is not configured')
    return c.json({ ok: false, error: 'SERVER_ERROR' }, 500)
  }

  // Cloudflare Turnstile siteverify
  const params = new URLSearchParams({ secret: secretKey, response: body.token })
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const result = await res.json<{ success: boolean; 'error-codes'?: string[] }>()
  if (!result.success) {
    const codes = (result['error-codes'] ?? ['unknown']).join(', ')
    console.error('[twoCh Turnstile] siteverify failed:', codes)
    return c.json({ ok: false, error: codes }, 400)
  }

  // edge-token を認証済みに更新する
  const kv = c.get('kv') as KvAdapter
  const existing = await kv.get<{ authed: boolean; expiresAt: string }>(
    'edge_token:' + body.edge_token, 'json',
  )
  if (!existing) {
    return c.json({ ok: false, error: 'EDGE_TOKEN_NOT_FOUND' }, 400)
  }
  const remainSec = Math.max(1, Math.floor((new Date(existing.expiresAt).getTime() - Date.now()) / 1000))
  await kv.put(
    'edge_token:' + body.edge_token,
    JSON.stringify({ authed: true, expiresAt: existing.expiresAt }),
    { expirationTtl: remainSec },
  )

  return c.json({ ok: true })
}

// IP アドレスと日付から 2ch 形式のデイリー ID を生成する (9文字)
async function dailyId(ip: string): Promise<string> {
  const seed = `${ip}:${new Date().toISOString().slice(0, 10)}`
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))
  return btoa(String.fromCharCode(...new Uint8Array(hash).slice(0, 7)))
    .replace(/\+/g, '.')
    .replace(/=/g, '')
    .slice(0, 9)
}

// Shift-JIS エンコード済みの Response を返す
function sjisResponse(text: string, contentType: string): Response {
  return new Response(toShiftJis(text), {
    headers: { 'Content-Type': contentType },
  })
}

// 書き込み成功レスポンス (2ch 互換 HTML)
// <!-- 2ch_X:true --> コメントは専用ブラウザが成功判定に使用する
function successCgi(boardId: string): Response {
  return sjisResponse(
    `<html><!-- 2ch_X:true --><head><meta http-equiv="Content-Type" content="text/html; charset=x-sjis"><title>書きこみました。</title></head><body>書きこみました。</body></html>`,
    'text/html; charset=x-sjis',
  )
}

// 書き込みエラーレスポンス (2ch 互換 HTML)
// <!-- 2ch_X:error --> コメントは専用ブラウザがエラー判定に使用する
function errorCgi(message: string): Response {
  return sjisResponse(
    `<html><!-- 2ch_X:error --><head><meta http-equiv="Content-Type" content="text/html; charset=x-sjis"><title>ＥＲＲＯＲ</title></head><body>${message}<br></body></html>`,
    'text/html; charset=x-sjis',
  )
}

// GET /bbsmenu.html
export async function bbsmenuHandler(c: Context<Env>): Promise<Response> {
  const db = c.get('db') as DbAdapter
  const boards = await db.all<Pick<BoardRow, 'id' | 'name' | 'description' | 'category'>>(
    'SELECT id, name, description, category FROM boards ORDER BY created_at ASC',
  )

  const host    = c.req.header('host') ?? 'localhost'
  const siteUrl = (c.env.SITE_URL ?? `https://${host}`).replace(/\/$/, '')
  const bbsName = c.env.BBS_NAME ?? '掲示板'

  return sjisResponse(buildBbsMenu(bbsName, siteUrl, boards.results), 'text/html; charset=Shift_JIS')
}

// GET /:board/subject.txt
export async function subjectTxtHandler(c: Context<Env>): Promise<Response> {
  const db = c.get('db') as DbAdapter
  const boardId = c.req.param('board')

  const result = await db.all<ThreadRow>(
    "SELECT id, title, post_count, created_at, updated_at, CAST(strftime('%s', created_at) AS INTEGER) as unix_ts FROM threads WHERE board_id = ? ORDER BY updated_at DESC",
    [boardId],
  )

  // 衝突解決: 同一 UNIX 時間は最古のスレッドのみ採用
  const uniqueMap = new Map<number, ThreadRow>()
  const byCreatedAt = [...result.results].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const t of byCreatedAt) {
    if (!uniqueMap.has(t.unix_ts)) uniqueMap.set(t.unix_ts, t)
  }

  // updated_at 降順で表示 (最新レス順)
  const lines = [...uniqueMap.values()]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(t => subjectLine(t.unix_ts, t.title, t.post_count))
    .join('')

  const bytes = toShiftJis(lines)
  return new Response(bytes, {
    headers: {
      'Content-Type':   'text/plain; charset=Shift_JIS',
      'Cache-Control':  's-maxage=1',
      'Content-Length': String(bytes.byteLength),
    },
  })
}

// If-Modified-Since の日付をパースして UTC ミリ秒を返す
// 2ch ブラウザは JST 形式 "YYYY/MM/DD HH:MM:SS" で送ってくる場合がある
function parseIfModifiedSince(value: string): number | null {
  // RFC1123 形式 ("Sun, 22 Mar 2026 00:12:26 GMT") を先に試みる
  const rfc = new Date(value).getTime()
  if (!isNaN(rfc)) return rfc
  // JST 形式 "YYYY/MM/DD HH:MM:SS" → UTC 変換 (JST = UTC+9)
  const m = value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})$/)
  if (!m) return null
  const jstMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  return jstMs - 9 * 3600 * 1000
}

// GET /:board/dat/:file  (例: 1234567890.dat)
// Range / If-Modified-Since による差分取得に対応:
//   206 Partial Content  → 新着あり、差分データを返す
//   304 Not Modified     → 更新なし
//   416 Range Not Satisfiable → ローカルDAT > リモートDAT (あぼーん等)
export async function datHandler(c: Context<Env>): Promise<Response> {
  const db = c.get('db') as DbAdapter
  const boardId   = c.req.param('board')
  const threadKey = parseInt(c.req.param('file').replace('.dat', ''), 10)

  if (isNaN(threadKey)) return new Response('Not Found', { status: 404 })

  // 衝突時は最古のスレッドを使用
  const thread = await db.first<{ id: string; title: string; created_at: string; updated_at: string }>(
    "SELECT id, title, created_at, updated_at FROM threads WHERE board_id = ? AND CAST(strftime('%s', created_at) AS INTEGER) = ? ORDER BY created_at ASC LIMIT 1",
    [boardId, threadKey],
  )

  if (!thread) return new Response('Not Found', { status: 404 })

  // Last-Modified: スレッドの最終更新時刻 (RFC1123 形式)
  const lastModified = new Date(thread.updated_at).toUTCString()

  // If-Modified-Since チェック: 更新なければ 304
  // 2ch ブラウザは JST 形式 "YYYY/MM/DD HH:MM:SS" で送るため専用パーサを使用
  const ifModifiedSince = c.req.header('If-Modified-Since')
  if (ifModifiedSince) {
    const ifMs = parseIfModifiedSince(ifModifiedSince)
    const lm   = new Date(thread.updated_at).getTime()
    if (ifMs !== null && lm <= ifMs) {
      return new Response(null, {
        status: 304,
        headers: {
          'Last-Modified': lastModified,
          'Cache-Control': 's-maxage=1',
        },
      })
    }
  }

  const posts = await db.all<PostRow>(
    'SELECT post_number, poster_name, poster_sub_info, display_user_id, content, created_at, is_deleted FROM posts WHERE thread_id = ? ORDER BY post_number ASC',
    [thread.id],
  )

  // 削除済み投稿を「あぼーん」に置換
  const maskedPosts = posts.results.map(p =>
    p.is_deleted ? { ...p, poster_name: 'あぼーん', poster_sub_info: null, display_user_id: 'あぼーん', content: 'あぼーん' } : p,
  )
  const dat      = maskedPosts.map((p, i) => datLine(p, i === 0, thread.title)).join('')
  const sjisData = toShiftJis(dat)
  const total    = sjisData.byteLength

  const rangeHeader = c.req.header('Range')
  if (!rangeHeader) {
    // Range ヘッダなし → 200 で全体を返す
    return new Response(sjisData, {
      status: 200,
      headers: {
        'Content-Type':   'text/plain; charset=Shift_JIS',
        'Last-Modified':  lastModified,
        'Accept-Ranges':  'bytes',
        'Content-Length': String(total),
        'Cache-Control':  's-maxage=1',
      },
    })
  }

  // Range: bytes={start}- の形式をパース
  const match = rangeHeader.match(/^bytes=(\d+)-$/)
  if (!match) return new Response('Invalid Range', { status: 400 })

  const start = parseInt(match[1], 10)

  // ローカルDAT > リモートDAT (あぼーん等) → 416
  if (start >= total) {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${total}`,
        'Last-Modified': lastModified,
        'Cache-Control': 's-maxage=1',
      },
    })
  }

  // 差分データを返す → 206
  const partial = sjisData.slice(start)
  return new Response(partial, {
    status: 206,
    headers: {
      'Content-Type':   'text/plain; charset=Shift_JIS',
      'Content-Range':  `bytes ${start}-${total - 1}/${total}`,
      'Content-Length': String(partial.byteLength),
      'Last-Modified':  lastModified,
      'Accept-Ranges':  'bytes',
      'Cache-Control':  's-maxage=1',
    },
  })
}

// GET /:board/SETTING.TXT
// 2ch ブラウザが板設定（デフォルト名・文字数制限等）を取得するために参照する
export async function settingTxtHandler(c: Context<Env>): Promise<Response> {
  const db = c.get('db') as DbAdapter
  const boardId = c.req.param('board')

  const board = await db.first<Pick<BoardRow,
    'id' | 'name' | 'default_poster_name' |
    'max_thread_title_length' | 'default_max_post_lines' |
    'default_max_poster_name_length' | 'default_max_poster_sub_info_length' | 'default_max_post_length'
  >>(
    'SELECT id, name, default_poster_name, max_thread_title_length, default_max_post_lines, default_max_poster_name_length, default_max_poster_sub_info_length, default_max_post_length FROM boards WHERE id = ?',
    [boardId],
  )

  if (!board) return new Response('Not Found', { status: 404 })

  const setting = [
    `${board.id}@${board.id}`,
    `BBS_TITLE=${board.name}`,
    `BBS_TITLE_ORIG=${board.name}`,
    `BBS_NONAME_NAME=${board.default_poster_name}`,
    'BBS_UNICODE=pass',
    `BBS_LINE_NUMBER=${board.default_max_post_lines}`,
    `BBS_SUBJECT_COUNT=${board.max_thread_title_length}`,
    `BBS_NAME_COUNT=${board.default_max_poster_name_length}`,
    `BBS_MAIL_COUNT=${board.default_max_poster_sub_info_length}`,
    `BBS_MESSAGE_COUNT=${board.default_max_post_length}`,
    'BBS_SLIP=verbose',
    'BBS_FORCE_ID=checked',
  ].join('\n') + '\n'

  const bytes = toShiftJis(setting)
  return new Response(bytes, {
    headers: {
      'Content-Type':   'text/plain; charset=Shift_JIS',
      'Cache-Control':  's-maxage=3600',
      'Content-Length': String(bytes.byteLength),
    },
  })
}

// POST /test/bbs.cgi
export async function writeCgiHandler(c: Context<Env>): Promise<Response> {
  const body = await c.req.arrayBuffer()
  const form = await parseSjisForm(body)

  const bbs     = (form['bbs']     ?? '').trim()
  const key     = (form['key']     ?? '0').trim()
  const from    = (form['FROM']    ?? '').trim()
  let   mail    = (form['mail']    ?? '').trim()
  const message = (form['MESSAGE'] ?? '').trim()
  const subject = (form['subject'] ?? '').trim()

  if (!bbs || !message) return errorCgi('入力が不正です')

  // Turnstile 認証チェック (edge-token 方式)
  // 専用ブラウザは Set-Cookie で受け取った UUID を Cookie として送信する
  // ユーザがブラウザで /auth/turnstile を開いて Turnstile を通過すると KV が authed:true に更新される
  const db = c.get('db') as DbAdapter
  const kv = c.get('kv') as KvAdapter

  if (c.env.ENABLE_TURNSTILE === 'true') {
    const siteUrl         = (c.env.SITE_URL ?? '').replace(/\/$/, '')
    const edgeTokenCookie = parseCookieValue(c.req.header('Cookie') ?? null, 'edge-token')

    if (!edgeTokenCookie || !(await checkEdgeToken(kv, edgeTokenCookie))) {
      return await edgeTokenChallenge(kv, siteUrl)
    }
  }

  const board = await db.first<Pick<BoardRow, 'id' | 'default_poster_name' | 'default_thread_permissions'>>(
    'SELECT id, default_poster_name, default_thread_permissions FROM boards WHERE id = ?',
    [bbs],
  )

  if (!board) return errorCgi('指定された板が存在しません')

  const ip              = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Real-IP') ?? ''
  const userId          = await dailyId(ip)
  const posterName      = from || board.default_poster_name
  const now             = new Date().toISOString()
  const threadOwnerUser = c.env.THREAD_OWNER_USER ?? null
  const threadOwnerGroup= c.env.THREAD_OWNER_GROUP ?? null
  const postOwnerUser   = c.env.POST_OWNER_USER ?? null
  const postOwnerGroup  = c.env.POST_OWNER_GROUP ?? null

  if (key === '0' || key === '') {
    // 新規スレッド作成
    if (!subject) return errorCgi('スレッドタイトルを入力してください')

    // 同一秒内のスレッド存在チェック (キー衝突防止)
    const unixNow = Math.floor(Date.now() / 1000)
    const conflict = await db.first(
      "SELECT 1 FROM threads WHERE board_id = ? AND CAST(strftime('%s', created_at) AS INTEGER) = ? LIMIT 1",
      [bbs, unixNow],
    )

    if (conflict) return errorCgi('同一秒内にスレッドが既に存在します。時間をおいてから再試行してください')

    const threadId = crypto.randomUUID()
    // D1 の batch 内では同バッチで挿入した行を FK チェック時に参照できないため、
    // スレッド作成と第1レス挿入を別々の run() で実行する
    await db.run(
      'INSERT INTO threads (id, board_id, permissions, title, post_count, owner_user_id, owner_group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [threadId, bbs, board.default_thread_permissions, subject, 1, threadOwnerUser, threadOwnerGroup, now, now],
    )
    await db.run(
      'INSERT INTO posts (id, thread_id, post_number, permissions, display_user_id, poster_name, poster_sub_info, content, owner_user_id, owner_group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), threadId, 1, '10,10,10,8', userId, posterName, mail, message, postOwnerUser, postOwnerGroup, now],
    )

    return successCgi(bbs)
  }

  // 既存スレッドへのレス投稿
  const threadKey = parseInt(key, 10)
  if (isNaN(threadKey)) return errorCgi('スレッドキーが不正です')

  const thread = await db.first<{ id: string; post_count: number }>(
    "SELECT id, post_count FROM threads WHERE board_id = ? AND CAST(strftime('%s', created_at) AS INTEGER) = ? ORDER BY created_at ASC LIMIT 1",
    [bbs, threadKey],
  )

  if (!thread) return errorCgi('指定されたスレッドが存在しません')

  const postNumber = thread.post_count + 1
  await db.batch([
    {
      sql: 'INSERT INTO posts (id, thread_id, post_number, permissions, display_user_id, poster_name, poster_sub_info, content, owner_user_id, owner_group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [crypto.randomUUID(), thread.id, postNumber, '10,10,10,8', userId, posterName, mail, message, postOwnerUser, postOwnerGroup, now],
    },
    {
      sql: 'UPDATE threads SET post_count = ?, updated_at = ? WHERE id = ?',
      params: [postNumber, now, thread.id],
    },
  ])

  return successCgi(bbs)
}
