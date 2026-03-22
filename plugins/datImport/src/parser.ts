import type { DatPost } from './types'

// Shift-JIS の ArrayBuffer を UTF-8 文字列に変換する
export function decodeDat(buffer: ArrayBuffer): string {
  return new TextDecoder('shift_jis').decode(buffer)
}

// dat テキストをパースして投稿配列に変換する
// 書式: 名前<>メール欄<>日付 ID<>本文<>スレタイトル(1行目のみ)\n
export function parseDat(text: string): DatPost[] {
  // \r\n と \r の両方に対応
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  return lines.map((line, idx) => parseDatLine(line, idx === 0))
}

function parseDatLine(line: string, isFirst: boolean): DatPost {
  const parts = line.split('<>')
  // 名前・スレタイトルは HTML タグ除去 + エンティティ変換
  const posterName    = decodeHtmlEntities(stripHtml(parts[0] ?? ''))
  const posterSubInfo = parts[1] ?? ''
  const dateAndId     = parts[2] ?? ''
  // 本文: <br> を改行に変換してから HTML エンティティを変換 (その他タグはそのまま)
  const content       = decodeHtmlEntities(convertBr(parts[3] ?? ''))
  const threadTitle   = isFirst ? decodeHtmlEntities(stripHtml(parts[4] ?? '')) : ''

  return {
    posterName,
    posterSubInfo,
    dateStr: parseDateToIso(dateAndId),
    displayUserId: extractId(dateAndId),
    content,
    threadTitle,
  }
}

// "2023/01/15(日) 12:34:56.78 ID:abc12345" → ISO 8601 UTC 文字列
// 5ch の時刻は JST (UTC+9) のため変換する
function parseDateToIso(dateAndId: string): string {
  const m = dateAndId.match(/^(\d{4})\/(\d{2})\/(\d{2})\([^)]+\) (\d{2}):(\d{2}):(\d{2})/)
  if (!m) return new Date().toISOString()
  const [, y, mo, d, h, mi, s] = m
  const jst = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`)
  return jst.toISOString()
}

// "... ID:abc12345" → "abc12345"
function extractId(dateAndId: string): string {
  const m = dateAndId.match(/ID:([^\s]+)/)
  return m?.[1] ?? ''
}

// HTML タグを除去する (<br> は先に変換済みであることを前提)
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '')
}

// <br> を改行文字に変換する (大文字小文字・自己終了タグを考慮)
function convertBr(text: string): string {
  return text.replace(/<br\s*\/?>/gi, '\n')
}

// HTML エンティティを文字に変換する
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
}
