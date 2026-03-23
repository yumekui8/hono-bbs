// オブジェクトストレージアダプター: R2 / S3 / MinIO を同一インターフェースで扱う
// R2 は S3-compatible なため、S3 実装で R2 の S3 互換エンドポイントも利用できる
// Node.js 向け実装 (@aws-sdk/client-s3 使用) は src/adapters/storage.node.ts を参照

export interface StorageAdapter {
  put(key: string, body: ArrayBuffer | ReadableStream, options?: { contentType?: string }): Promise<void>
  get(key: string): Promise<ArrayBuffer | null>
  delete(key: string): Promise<void>
}

// Cloudflare R2 ネイティブバインディングを StorageAdapter にラップする
export function createR2Adapter(bucket: R2Bucket): StorageAdapter {
  return {
    async put(key, body, options) {
      await bucket.put(key, body, {
        httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
      })
    },
    async get(key) {
      const object = await bucket.get(key)
      if (!object) return null
      return object.arrayBuffer()
    },
    delete(key) {
      return bucket.delete(key)
    },
  }
}

// S3-compatible ストレージ (AWS S3 / MinIO / R2 S3互換エンドポイント) アダプター
// Cloudflare Workers 環境では Web Crypto API による AWS Signature V4 を使用する
// Node.js 環境では src/adapters/storage.node.ts の @aws-sdk/client-s3 実装を使用すること
export function createS3Adapter(config: {
  endpoint: string    // 例: "https://s3.amazonaws.com", "http://minio:9000", R2のS3エンドポイント
  region: string      // 例: "us-east-1", "auto" (R2)
  bucket: string
  accessKey: string
  secretKey: string
}): StorageAdapter {
  const { endpoint, region, bucket, accessKey, secretKey } = config

  // AWS Signature V4 HMAC-SHA256 署名ヘルパー
  async function hmacSha256(keyData: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
    const rawKey = typeof keyData === 'string'
      ? new TextEncoder().encode(keyData)
      : keyData
    const cryptoKey = await crypto.subtle.importKey(
      'raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
  }

  function toHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data
    return toHex(await crypto.subtle.digest('SHA-256', buf))
  }

  async function buildAuthHeaders(
    method: string,
    path: string,
    body?: ArrayBuffer,
  ): Promise<Headers> {
    const now = new Date()
    const amzDate = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
    const dateStamp = amzDate.slice(0, 8)
    const host = new URL(endpoint).host
    const contentHash = body ? await sha256Hex(body) : await sha256Hex('')

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${contentHash}\nx-amz-date:${amzDate}\n`
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
    const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, contentHash].join('\n')

    const scope = `${dateStamp}/${region}/s3/aws4_request`
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')

    const signingKey = await hmacSha256(
      await hmacSha256(
        await hmacSha256(
          await hmacSha256('AWS4' + secretKey, dateStamp),
          region,
        ),
        's3',
      ),
      'aws4_request',
    )
    const signature = toHex(await hmacSha256(signingKey, stringToSign))

    const headers = new Headers()
    headers.set('Host', host)
    headers.set('X-Amz-Date', amzDate)
    headers.set('X-Amz-Content-Sha256', contentHash)
    headers.set('Authorization',
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`)
    return headers
  }

  return {
    async put(key, body, options) {
      const buf = body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer()
      const path = `/${bucket}/${key}`
      const headers = await buildAuthHeaders('PUT', path, buf)
      if (options?.contentType) headers.set('Content-Type', options.contentType)
      const res = await fetch(`${endpoint}${path}`, { method: 'PUT', headers, body: buf })
      if (!res.ok) throw new Error(`S3 PUT failed: ${res.status} ${await res.text()}`)
    },
    async get(key) {
      const path = `/${bucket}/${key}`
      const headers = await buildAuthHeaders('GET', path)
      const res = await fetch(`${endpoint}${path}`, { method: 'GET', headers })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`S3 GET failed: ${res.status}`)
      return res.arrayBuffer()
    },
    async delete(key) {
      const path = `/${bucket}/${key}`
      const headers = await buildAuthHeaders('DELETE', path)
      const res = await fetch(`${endpoint}${path}`, { method: 'DELETE', headers })
      if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE failed: ${res.status}`)
    },
  }
}
