import type { PostRow } from './types'

// ISO 8601 UTC 文字列を 2ch 形式の日付文字列 (JST) に変換する
// 例: "2026-03-22T00:12:26.257Z" → "2026/03/22(日) 09:12:26.257"
function formatDate(isoString: string): string {
  const utc = new Date(isoString)
  const jst = new Date(utc.getTime() + 9 * 3600 * 1000)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const y  = jst.getUTCFullYear()
  const mo = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const d  = String(jst.getUTCDate()).padStart(2, '0')
  const h  = String(jst.getUTCHours()).padStart(2, '0')
  const mi = String(jst.getUTCMinutes()).padStart(2, '0')
  const s  = String(jst.getUTCSeconds()).padStart(2, '0')
  const ms = String(jst.getUTCMilliseconds()).padStart(3, '0')
  return `${y}/${mo}/${d}(${days[jst.getUTCDay()]}) ${h}:${mi}:${s}.${ms}`
}

// 本文を dat 形式にエンコードする
// 改行 → <br>、HTML 特殊文字をエンティティに変換する
function encodeContent(content: string): string {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

// dat ファイルの1行を生成する
// 書式: 名前<>メール<>日付 ID<>本文<>スレタイトル（1行目のみ）
export function datLine(post: PostRow, isFirst: boolean, threadTitle: string): string {
  const name    = post.poster_name || '名無し'
  const mail    = post.poster_option_info ?? ''
  const date    = formatDate(post.created_at)
  const id      = post.author_id ? ` ID:${post.author_id}` : ''
  const content = encodeContent(post.content)
  const title   = isFirst ? threadTitle : ''
  return `${name}<>${mail}<>${date}${id}<>${content}<>${title}\n`
}

// subject.txt の1行を生成する
// 書式: {thread_key}.dat<>{title} ({res_count})
export function subjectLine(unixTs: number, title: string, postCount: number): string {
  return `${unixTs}.dat<>${title} (${postCount})\n`
}

// bbsmenu.html を生成する
export function buildBbsMenu(
  bbsName: string,
  siteUrl: string,
  boards: { id: string; name: string; category: string | null }[],
): string {
  // カテゴリ別にグループ化
  const catMap = new Map<string, typeof boards>()
  for (const b of boards) {
    const cat = b.category ?? 'その他'
    if (!catMap.has(cat)) catMap.set(cat, [])
    catMap.get(cat)!.push(b)
  }

  const base = siteUrl.replace(/\/$/, '')
  let html = [
    '<html>',
    '<head>',
    '<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">',
    `<title>${bbsName}</title>`,
    '</head>',
    '<body>',
  ].join('\n') + '\n'

  for (const [cat, list] of catMap) {
    html += `<BR><B>${cat}</B><BR>\n`
    for (const b of list) {
      html += `<A HREF=${base}/${b.id}/>${b.name}</A><BR>\n`
    }
  }

  html += '</body>\n</html>\n'
  return html
}
