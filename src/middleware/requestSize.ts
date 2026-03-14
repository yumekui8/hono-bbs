import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

// "1mb", "500kb", "1024" などの文字列をバイト数に変換する
function parseSize(sizeStr: string): number | null {
  const lower = sizeStr.toLowerCase().trim()
  if (lower.endsWith('mb')) {
    const n = parseFloat(lower.slice(0, -2))
    return isNaN(n) ? null : Math.floor(n * 1024 * 1024)
  }
  if (lower.endsWith('kb')) {
    const n = parseFloat(lower.slice(0, -2))
    return isNaN(n) ? null : Math.floor(n * 1024)
  }
  const n = parseInt(lower, 10)
  return isNaN(n) ? null : n
}

// Content-Length ヘッダーによるリクエストサイズ制限
// MAX_REQUEST_SIZE 環境変数が設定されている場合のみ有効
export const requestSizeLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const maxSizeStr = c.env.MAX_REQUEST_SIZE
  if (!maxSizeStr) {
    await next()
    return
  }

  const maxBytes = parseSize(maxSizeStr)
  if (maxBytes === null) {
    await next()
    return
  }

  const contentLength = c.req.header('Content-Length')
  if (contentLength) {
    const length = parseInt(contentLength, 10)
    if (!isNaN(length) && length > maxBytes) {
      return c.json({ error: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' }, 413)
    }
  }

  await next()
}
