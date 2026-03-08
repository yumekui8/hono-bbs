// SHA-256ハッシュの先頭N文字 (hex) を返す
export async function hashPrefix(input: string, length = 10): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}

// UTC日付文字列 YYYY-MM-DD
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

// IDフォーマットに基づき表示用IDを計算
// turnstileSessionId: TurnstileセッションのセッションID。匿名ID生成の種として使用。
//   Turnstileセッションを取り直すとIDも変わる。
// userId: ログイン済みユーザのID (セッションから取得)
export async function computeDisplayUserId(
  idFormat: string,
  userId: string | null,
  turnstileSessionId: string | null,
): Promise<string> {
  const anonKey = turnstileSessionId ?? 'anonymous'
  const today = todayUTC()

  switch (idFormat) {
    case 'daily_hash':
      // 全員: TurnstileセッションID+日付の日毎ハッシュ
      return hashPrefix(`${anonKey}:${today}`)

    case 'daily_hash_or_user':
      // 匿名: 日毎ハッシュ / ログイン済み: ユーザID先頭10文字
      if (userId) return userId.slice(0, 10)
      return hashPrefix(`${anonKey}:${today}`)

    case 'api_key_hash':
      // 全員: TurnstileセッションIDのハッシュ
      return hashPrefix(anonKey)

    case 'api_key_hash_or_user':
      // 匿名: TurnstileセッションIDハッシュ / ログイン済み: ユーザID先頭10文字
      if (userId) return userId.slice(0, 10)
      return hashPrefix(anonKey)

    case 'none':
    default:
      return ''
  }
}
