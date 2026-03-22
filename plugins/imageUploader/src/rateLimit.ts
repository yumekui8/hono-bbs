// Sliding Window Log によるレート制限
// KV に「アップロードしたエポックミリ秒の配列」を保存し、
// ウィンドウ内のタイムスタンプ数で判定する。
//
// UPLOAD_RATE_LIMIT: ウィンドウ内の最大アップロード数 (0=無制限)
// UPLOAD_RATE_WINDOW: ウィンドウ幅 (分, デフォルト: 60)
//
// 動作:
//   1. KV からタイムスタンプ配列を取得
//   2. ウィンドウ外の古いタイムスタンプを除去
//   3. 残った件数が limit 未満 → 新タイムスタンプを追加して KV を更新 → 許可
//   4. limit 以上 → 拒否 (ウィンドウが経過すれば自動的に回復)

function parseLimit(s: string | undefined): number {
  return Math.max(0, parseInt(s ?? '0', 10) || 0)
}

function parseWindowMs(s: string | undefined): number {
  const minutes = Math.max(1, parseInt(s ?? '60', 10) || 60)
  return minutes * 60 * 1000
}

// アップロード可否を判定し、許可される場合はタイムスタンプを記録する。
// check と record を一度にまとめることで二重チェックを避ける。
export async function checkAndRecord(
  kv: KVNamespace | undefined,
  identifier: string,
  limitStr: string | undefined,
  windowStr: string | undefined,
): Promise<boolean> {
  const limit = parseLimit(limitStr)
  if (limit === 0) return true  // 無制限
  if (!kv) return true          // IMAGE_KV 未設定時は無制限

  const windowMs = parseWindowMs(windowStr)
  const now = Date.now()
  const windowStart = now - windowMs
  const key = `ratelimit:${identifier}`

  // 保存済みタイムスタンプを取得し、ウィンドウ外を除去
  const raw = await kv.get(key)
  const all: number[] = raw ? (JSON.parse(raw) as number[]) : []
  const recent = all.filter(t => t > windowStart)

  if (recent.length >= limit) {
    return false  // 拒否: ウィンドウ内がすでに上限
  }

  // 許可: 新タイムスタンプを追加して保存
  // TTL = ウィンドウ幅 (秒) にすることで古い KV キーが自然に消える
  recent.push(now)
  await kv.put(key, JSON.stringify(recent), { expirationTtl: Math.ceil(windowMs / 1000) })

  return true
}
