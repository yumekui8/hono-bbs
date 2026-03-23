// Node.js 向けオブジェクトストレージアダプター実装
// @aws-sdk/client-s3 を使用 (AWS S3 / MinIO / R2 S3互換エンドポイント)
// 使用には npm install @aws-sdk/client-s3 が必要
//
// 環境変数:
//   STORAGE_DRIVER=s3 | r2 | none (デフォルト: none)
//   STORAGE_ENDPOINT=https://s3.amazonaws.com  (MinIO/R2の場合はそのエンドポイント)
//   STORAGE_REGION=us-east-1
//   STORAGE_BUCKET=your-bucket-name
//   STORAGE_ACCESS_KEY=your-access-key
//   STORAGE_SECRET_KEY=your-secret-key  (wrangler secret 相当)
//   STORAGE_PUBLIC_URL=https://cdn.example.com  (任意: 公開URL)

import type { StorageAdapter } from './storage'

// @aws-sdk/client-s3 を使用した S3-compatible アダプター
export function createNodeS3Adapter(config: {
  endpoint?: string
  region: string
  bucket: string
  accessKey: string
  secretKey: string
}): StorageAdapter {
  // 動的インポートで @aws-sdk/client-s3 を使用
  let clientPromise: Promise<{
    S3Client: unknown
    PutObjectCommand: unknown
    GetObjectCommand: unknown
    DeleteObjectCommand: unknown
  }>

  async function getClient() {
    if (!clientPromise) {
      clientPromise = import('@aws-sdk/client-s3') as never
    }
    return clientPromise
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s3: any

  async function getS3() {
    if (!s3) {
      const sdk = await getClient() as { S3Client: new (config: unknown) => unknown }
      s3 = new sdk.S3Client({
        region: config.region,
        endpoint: config.endpoint,
        credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
        forcePathStyle: !!config.endpoint, // MinIO は forcePathStyle 必須
      })
    }
    return s3
  }

  return {
    async put(key, body, options) {
      const sdk = await getClient() as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        PutObjectCommand: new (params: unknown) => any
      }
      const client = await getS3()
      const buf = body instanceof ArrayBuffer ? Buffer.from(body) : body
      await client.send(new sdk.PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buf,
        ContentType: options?.contentType,
      }))
    },
    async get(key) {
      const sdk = await getClient() as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        GetObjectCommand: new (params: unknown) => any
        NoSuchKeyException?: unknown
      }
      const client = await getS3()
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await client.send(new (sdk.GetObjectCommand as any)({ Bucket: config.bucket, Key: key }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunks: Buffer[] = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const chunk of res.Body as any) chunks.push(Buffer.from(chunk))
        return Buffer.concat(chunks).buffer
      } catch (e: unknown) {
        if ((e as { name?: string }).name === 'NoSuchKey') return null
        throw e
      }
    },
    async delete(key) {
      const sdk = await getClient() as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        DeleteObjectCommand: new (params: unknown) => any
      }
      const client = await getS3()
      await client.send(new sdk.DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
    },
  }
}

// 環境変数からストレージアダプターを生成するファクトリ関数
export function createStorageAdapterFromEnv(): StorageAdapter | null {
  const driver = process.env.STORAGE_DRIVER ?? 'none'
  if (driver === 'none') return null

  const bucket = process.env.STORAGE_BUCKET
  const accessKey = process.env.STORAGE_ACCESS_KEY
  const secretKey = process.env.STORAGE_SECRET_KEY
  const region = process.env.STORAGE_REGION ?? 'us-east-1'

  if (!bucket || !accessKey || !secretKey) {
    console.error('[Storage] STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY are required')
    return null
  }

  return createNodeS3Adapter({
    endpoint: process.env.STORAGE_ENDPOINT,
    region,
    bucket,
    accessKey,
    secretKey,
  })
}
