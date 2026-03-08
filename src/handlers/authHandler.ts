import type { Context } from 'hono'
import { isZodError, zodMessage } from '../utils/zodHelper'
import type { AppEnv } from '../types'
import * as authService from '../services/authService'

// GET /auth/turnstile - Turnstile ウィジェット HTML ページ
export async function turnstilePageHandler(c: Context<AppEnv>): Promise<Response> {
  const siteKey = c.env.TURNSTILE_SITE_KEY ?? ''
  const apiBase = c.env.API_BASE_PATH ?? '/api/v1'
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Turnstile 認証</title>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <style>
    body { font-family: sans-serif; max-width: 480px; margin: 60px auto; padding: 0 16px; }
    h1 { font-size: 1.2rem; }
    #status { margin: 16px 0; color: #555; }
    #session-box { display: none; margin-top: 24px; }
    #session-id {
      display: block; width: 100%; box-sizing: border-box;
      font-family: monospace; font-size: 1rem;
      padding: 12px; background: #f0f4ff; border: 2px solid #4a80f0;
      border-radius: 6px; word-break: break-all;
    }
    button#copy-btn {
      margin-top: 8px; padding: 8px 16px; background: #4a80f0; color: #fff;
      border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;
    }
    button#copy-btn:hover { background: #3060d0; }
    .hint { margin-top: 12px; font-size: 0.85rem; color: #888; }
    .error { color: #d00; }
  </style>
</head>
<body>
  <h1>Turnstile 認証</h1>
  <p id="status">チャレンジを完了してください。</p>
  <div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onSuccess"></div>
  <div id="session-box">
    <p><strong>セッションID（以下をコピーして bbs.sh に貼り付けてください）</strong></p>
    <code id="session-id"></code>
    <br>
    <button id="copy-btn" onclick="copyId()">コピー</button>
    <p class="hint">このセッションIDは 24 時間有効です。</p>
  </div>
  <script>
    async function onSuccess(token) {
      document.getElementById('status').textContent = '検証中...';
      try {
        const res = await fetch('${apiBase}/auth/turnstile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.data && data.data.sessionId) {
          document.getElementById('session-id').textContent = data.data.sessionId;
          document.getElementById('session-box').style.display = 'block';
          document.getElementById('status').textContent = '認証完了！';
        } else {
          const codes = (data.errorCodes || []).join(', ') || data.error || 'unknown';
          document.getElementById('status').innerHTML =
            '<span class="error">検証に失敗しました: ' + codes + '</span>';
        }
      } catch (e) {
        document.getElementById('status').innerHTML =
          '<span class="error">通信エラーが発生しました</span>';
      }
    }
    function copyId() {
      const text = document.getElementById('session-id').textContent;
      navigator.clipboard.writeText(text).then(() => {
        document.getElementById('copy-btn').textContent = 'コピーしました!';
        setTimeout(() => { document.getElementById('copy-btn').textContent = 'コピー'; }, 2000);
      });
    }
  </script>
</body>
</html>`
  return c.html(html)
}

// POST /auth/turnstile - Turnstile トークン検証 → セッションID発行
export async function turnstileVerifyHandler(c: Context<AppEnv>): Promise<Response> {
  // 開発環境ではスキップ
  if (c.env.DISABLE_TURNSTILE === 'true') {
    return c.json({ data: { sessionId: 'dev-turnstile-disabled' } })
  }

  const body = await c.req.json<{ token?: string }>()
  if (!body.token) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'token is required' }, 400)
  }

  const result = await authService.issueTurnstileSession(c.env.SESSION_KV, body.token, c.env.TURNSTILE_SECRET_KEY)
  if (!result.sessionId) {
    return c.json({ error: 'TURNSTILE_FAILED', message: 'Turnstile verification failed', errorCodes: result.errorCodes }, 400)
  }

  return c.json({ data: { sessionId: result.sessionId } })
}

// POST /auth/setup - admin 初期パスワード設定 (一回限り)
export async function setupHandler(c: Context<AppEnv>): Promise<Response> {
  const adminInitialPassword = c.env.ADMIN_INITIAL_PASSWORD
  if (!adminInitialPassword) {
    return c.json({ error: 'SETUP_NOT_CONFIGURED', message: 'ADMIN_INITIAL_PASSWORD is not configured' }, 500)
  }
  try {
    await authService.setup(c.env.DB, adminInitialPassword)
    return c.json({ data: { message: 'Admin password has been set' } })
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'ADMIN_NOT_FOUND') {
        return c.json({ error: 'SETUP_FAILED', message: 'Admin user not found. Run init.sql first.' }, 500)
      }
      if (e.message === 'ALREADY_SETUP') {
        return c.json({ error: 'ALREADY_SETUP', message: 'Admin password is already set' }, 409)
      }
    }
    throw e
  }
}

// POST /auth/signup
export async function registerHandler(c: Context<AppEnv>): Promise<Response> {
  try {
    const body = await c.req.json()
    const input = authService.parseRegister(body)
    const user = await authService.register(c.env.DB, input)
    return c.json({ data: user }, 201)
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'USERNAME_TAKEN') {
      return c.json({ error: 'USERNAME_TAKEN', message: 'Username is already taken' }, 409)
    }
    throw e
  }
}

// POST /auth/signin
export async function loginHandler(c: Context<AppEnv>): Promise<Response> {
  try {
    const body = await c.req.json()
    const input = authService.parseLogin(body)
    const { user, session } = await authService.login(c.env.DB, c.env.SESSION_KV, input)
    return c.json({ data: { sessionId: session.id, userId: user.id, username: user.username, expiresAt: session.expiresAt } })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'INVALID_CREDENTIALS') {
      return c.json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' }, 401)
    }
    throw e
  }
}

// POST /auth/logout
export async function logoutHandler(c: Context<AppEnv>): Promise<Response> {
  const sessionId = c.req.header('X-Session-Id')
  if (!sessionId) {
    return c.json({ error: 'UNAUTHORIZED', message: 'X-Session-Id header required' }, 401)
  }
  await authService.logout(c.env.SESSION_KV, sessionId)
  return new Response(null, { status: 204 })
}
