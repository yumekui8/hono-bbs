import type { Context } from 'hono'
import type { PluginEnv } from './types'
import * as service from './service'

// returnTo / Referer が ALLOW_BBS_UI_DOMAINS に含まれているか確認する
function resolveRedirectTo(
  returnToParam: string,
  referer: string,
  allowedDomains: string[],
): string {
  function isAllowed(url: string): boolean {
    if (!url || allowedDomains.length === 0) return false
    try {
      const parsed = new URL(url)
      return allowedDomains.some(d => parsed.host === d || parsed.hostname === d)
    } catch {
      return false
    }
  }
  if (isAllowed(returnToParam)) return returnToParam
  if (isAllowed(referer)) return referer
  return ''
}

// GET - Turnstile ウィジェット HTML ページ
export async function turnstilePageHandler(c: Context<PluginEnv>): Promise<Response> {
  const siteKey = c.env.TURNSTILE_SITE_KEY ?? ''
  const { label: ttlLabel } = service.parseTurnstileTtl(c.env.TURNSTILE_TOKEN_TTL)

  const returnToParam = c.req.query('returnTo') ?? ''
  const referer = c.req.header('Referer') ?? ''
  const allowedDomains = (c.env.ALLOW_BBS_UI_DOMAINS ?? '')
    .split(',').map(d => d.trim()).filter(Boolean)

  const redirectTo = resolveRedirectTo(returnToParam, referer, allowedDomains)
  // redirectTo を JS に安全に埋め込む (JSON.stringify でエスケープ)
  const redirectToJs = JSON.stringify(redirectTo)

  // POSTエンドポイントはこのページ自身と同じURL (GETとPOSTで同一パス)
  const postEndpoint = JSON.stringify(c.req.url.split('?')[0])

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
    .warn  { color: #b60; }
  </style>
</head>
<body>
  <h1>Turnstile 認証</h1>
  <p id="status">チャレンジを完了してください。</p>
  <div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onSuccess"></div>
  <div id="session-box">
    <p><strong>セッションID（以下をコピーして利用してください）</strong></p>
    <code id="session-id"></code>
    <br>
    <button id="copy-btn" onclick="copyId()">コピー</button>
    <p class="hint">このセッションIDの有効期限: ${ttlLabel}</p>
  </div>
  <script>
    const redirectTo = ${redirectToJs};
    const postEndpoint = ${postEndpoint};
    let submitted = false;
    async function onSuccess(token) {
      if (submitted) return;
      submitted = true;
      document.getElementById('status').textContent = '検証中...';
      try {
        const res = await fetch(postEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.data && data.data.sessionId) {
          if (redirectTo) {
            const sep = redirectTo.includes('?') ? '&' : '?';
            window.location.href = redirectTo + sep + 'setTurnstileToken=' + encodeURIComponent(data.data.sessionId);
          } else {
            document.getElementById('session-id').textContent = data.data.sessionId;
            document.getElementById('session-box').style.display = 'block';
            if (data.data.alreadyIssued) {
              document.getElementById('status').innerHTML =
                '<span class="warn">⚠ 本日すでに同じ端末からトークンを発行済みです。既存のセッションIDを表示しています。</span>';
            } else {
              document.getElementById('status').textContent = '認証完了！';
            }
          }
        } else {
          if (data.error === 'SESSION_CREATE_FAILED') {
            document.getElementById('status').innerHTML =
              '<span class="error">セッションの作成に失敗しました。管理者に問い合わせてください。</span>';
          } else {
            const codes = (data.errorCodes || []).join(', ') || data.error || 'unknown';
            const span = document.createElement('span');
            span.className = 'error';
            span.textContent = '検証に失敗しました: ' + codes;
            const statusEl = document.getElementById('status');
            statusEl.textContent = '';
            statusEl.appendChild(span);
          }
          submitted = false;
        }
      } catch (e) {
        document.getElementById('status').innerHTML =
          '<span class="error">通信エラーが発生しました</span>';
        submitted = false;
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

// POST - Turnstile トークン検証 → セッションID発行
export async function turnstileVerifyHandler(c: Context<PluginEnv>): Promise<Response> {
  // 開発環境ではスキップ
  if (c.env.DISABLE_TURNSTILE === 'true') {
    return c.json({ data: { sessionId: 'dev-turnstile-disabled', alreadyIssued: false } })
  }

  const body = await c.req.json<{ token?: string }>()
  if (!body.token) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'token is required' }, 400)
  }

  const clientIP = c.req.header('CF-Connecting-IP')
    ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    ?? 'unknown'
  const userAgent = c.req.header('User-Agent') ?? 'unknown'

  const { minutes: ttlMinutes } = service.parseTurnstileTtl(c.env.TURNSTILE_TOKEN_TTL)
  const result = await service.issueTurnstileSession(
    c.env.SESSION_KV, body.token, c.env.TURNSTILE_SECRET_KEY, clientIP, userAgent, ttlMinutes,
  )
  if (!result.sessionId) {
    if (result.errorCodes?.includes('kv-write-failed')) {
      return c.json({ error: 'SESSION_CREATE_FAILED', message: 'Failed to create session' }, 500)
    }
    return c.json({ error: 'TURNSTILE_FAILED', message: 'Turnstile verification failed', errorCodes: result.errorCodes }, 400)
  }

  return c.json({ data: { sessionId: result.sessionId, alreadyIssued: result.alreadyIssued } })
}
