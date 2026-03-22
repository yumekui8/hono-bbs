// AWS Signature Version 4 による S3 互換 Presigned PUT URL 生成 / 署名付き DELETE リクエスト

export type StorageConfig = {
  endpoint: string       // e.g. "https://xxx.r2.cloudflarestorage.com"
  bucket: string
  region: string         // R2: "auto", AWS S3: "ap-northeast-1" 等
  accessKeyId: string
  secretAccessKey: string
}

async function hmacSha256(key: string | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data))
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)))
}

function buildAmzDate(): { amzDate: string; dateShort: string } {
  const s = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  return { amzDate: s, dateShort: s.slice(0, 8) }
}

async function signingKey(secretKey: string, dateShort: string, region: string): Promise<ArrayBuffer> {
  const k1 = await hmacSha256('AWS4' + secretKey, dateShort)
  const k2 = await hmacSha256(k1, region)
  const k3 = await hmacSha256(k2, 's3')
  return hmacSha256(k3, 'aws4_request')
}

// Presigned PUT URL を生成する
// クライアントはこの URL に対して Content-Type ヘッダーを付けて直接 PUT アップロードを行う
// content-type を署名ヘッダーに含めることで、指定外の MIME タイプのアップロードを防ぐ
export async function generatePresignedPutUrl(
  config: StorageConfig,
  key: string,
  contentType: string,
  expiresIn: number,        // 秒
): Promise<string> {
  const { amzDate, dateShort } = buildAmzDate()
  const url = new URL(`${config.endpoint.replace(/\/$/, '')}/${config.bucket}/${key}`)
  const host = url.host
  const credentialScope = `${dateShort}/${config.region}/s3/aws4_request`

  const params = new URLSearchParams([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', expiresIn.toString()],
    ['X-Amz-SignedHeaders', 'content-type;host'],
  ])
  params.sort()
  const canonicalQuery = params.toString()

  const canonicalRequest = [
    'PUT',
    url.pathname,
    canonicalQuery,
    `content-type:${contentType}\nhost:${host}\n`,
    'content-type;host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const sig = toHex(await hmacSha256(await signingKey(config.secretAccessKey, dateShort, config.region), stringToSign))
  return `${url.origin}${url.pathname}?${canonicalQuery}&X-Amz-Signature=${sig}`
}

// S3 互換ストレージからオブジェクトを削除する (管理者削除・自動削除で使用)
export async function deleteObject(config: StorageConfig, key: string): Promise<void> {
  const { amzDate, dateShort } = buildAmzDate()
  const url = new URL(`${config.endpoint.replace(/\/$/, '')}/${config.bucket}/${key}`)
  const host = url.host
  const credentialScope = `${dateShort}/${config.region}/s3/aws4_request`
  const payloadHash = await sha256Hex('')

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const canonicalRequest = [
    'DELETE',
    url.pathname,
    '',
    canonicalHeaders,
    'host;x-amz-content-sha256;x-amz-date',
    payloadHash,
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const sig = toHex(await hmacSha256(await signingKey(config.secretAccessKey, dateShort, config.region), stringToSign))
  const authHeader = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    'SignedHeaders=host;x-amz-content-sha256;x-amz-date',
    `Signature=${sig}`,
  ].join(', ')

  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authHeader,
    },
  })

  if (!res.ok && res.status !== 404) {
    throw new Error(`Storage DELETE failed: ${res.status}`)
  }
}
