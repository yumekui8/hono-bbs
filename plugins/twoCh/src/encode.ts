// encoding-japanese: Shift-JIS エンコード/デコードのためのライブラリ
// Cloudflare Workers の TextEncoder は UTF-8 のみサポートするため使用
import Encoding from 'encoding-japanese'

// UTF-8 文字列を Shift-JIS の Uint8Array に変換する
export function toShiftJis(text: string): Uint8Array {
  const codePoints = Encoding.stringToCode(text)
  const sjisBytes = Encoding.convert(codePoints, { to: 'SJIS', from: 'UNICODE' })
  return new Uint8Array(sjisBytes)
}

// Shift-JIS URL エンコードされた値を UTF-8 文字列に変換する
// application/x-www-form-urlencoded で Shift-JIS エンコードされたフォームフィールド用
function decodeSjisField(encoded: string): string {
  const bytes: number[] = []
  let i = 0
  while (i < encoded.length) {
    if (encoded[i] === '%' && i + 2 < encoded.length) {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16))
      i += 3
    } else if (encoded[i] === '+') {
      bytes.push(0x20)  // + はスペース
      i++
    } else {
      bytes.push(encoded.charCodeAt(i))
      i++
    }
  }
  return new TextDecoder('shift_jis').decode(new Uint8Array(bytes))
}

// Shift-JIS エンコードの application/x-www-form-urlencoded ボディをパースする
// 2ch ブラウザが送信するフォームデータのデコードに使用
export async function parseSjisForm(body: ArrayBuffer): Promise<Record<string, string>> {
  // Latin-1 として読み込むことでバイト値を保持しながら文字列として扱う
  const rawText = new TextDecoder('latin1').decode(body)
  const result: Record<string, string> = {}
  for (const pair of rawText.split('&')) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const key = decodeURIComponent(pair.slice(0, eq))
    result[key] = decodeSjisField(pair.slice(eq + 1))
  }
  return result
}
