import type { Context } from 'hono'
import type { PluginEnv } from './types'
import * as presign from './presign'
import * as repository from './repository'
import * as rateLimit from './rateLimit'

const DEFAULT_ALLOWED_TYPES = 'image/jpeg,image/png,image/gif,image/webp'

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/gif':  '.gif',
  'image/webp': '.webp',
}

function getStorageConfig(env: PluginEnv['Bindings']): presign.StorageConfig {
  return {
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  }
}

function buildPublicUrl(env: PluginEnv['Bindings'], storageKey: string): string {
  return `${env.IMAGE_PUBLIC_BASE_URL.replace(/\/$/, '')}/${storageKey}`
}

// POST /upload/request
// Presigned PUT URL を発行する (Turnstile + レート制限チェック)
export async function requestUploadHandler(c: Context<PluginEnv>): Promise<Response> {
  // レート制限: Turnstile セッション ID または IP を識別子として使用
  // checkAndRecord は判定と記録を同時に行う (Sliding Window Log 方式)
  const identifier = c.get('turnstileSessionId') ?? c.req.header('CF-Connecting-IP') ?? 'unknown'
  const allowed = await rateLimit.checkAndRecord(
    c.env.IMAGE_KV, identifier, c.env.UPLOAD_RATE_LIMIT, c.env.UPLOAD_RATE_WINDOW,
  )
  if (!allowed) {
    return c.json({ error: 'RATE_LIMIT_EXCEEDED', message: 'Upload rate limit exceeded' }, 429)
  }

  let body: { filename?: string; contentType?: string; size?: number }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Invalid JSON body' }, 400)
  }

  if (!body.contentType) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'contentType is required' }, 400)
  }

  // 許可された MIME タイプのチェック
  const allowedTypes = (c.env.ALLOWED_CONTENT_TYPES ?? DEFAULT_ALLOWED_TYPES)
    .split(',').map(t => t.trim()).filter(Boolean)
  if (!allowedTypes.includes(body.contentType)) {
    return c.json({ error: 'INVALID_CONTENT_TYPE', message: `Allowed types: ${allowedTypes.join(', ')}` }, 400)
  }

  // ファイルサイズ上限チェック (クライアント申告値で判断)
  const maxSize = parseInt(c.env.MAX_IMAGE_SIZE ?? '0', 10)
  if (maxSize > 0 && body.size && body.size > maxSize) {
    return c.json({ error: 'FILE_TOO_LARGE', message: `Max file size: ${maxSize} bytes` }, 400)
  }

  const imageId = crypto.randomUUID()
  const ext = MIME_TO_EXT[body.contentType] ?? ''
  const storageKey = `images/${imageId}${ext}`
  const expiresIn = Math.max(60, parseInt(c.env.PRESIGNED_URL_TTL ?? '300', 10) || 300)
  const uploadUrl = await presign.generatePresignedPutUrl(getStorageConfig(c.env), storageKey, body.contentType, expiresIn)

  const now = new Date()
  const ttlDays = parseInt(c.env.IMAGE_TTL_DAYS ?? '0', 10)
  const expiresAt = ttlDays > 0
    ? new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  const deleteToken = crypto.randomUUID()

  await repository.createImage(c.env.IMAGE_DB, {
    id: imageId,
    storageKey,
    originalFilename: body.filename ?? null,
    contentType: body.contentType,
    size: body.size ?? null,
    status: 'pending',
    turnstileSessionId: c.get('turnstileSessionId'),
    reportCount: 0,
    createdAt: now.toISOString(),
    confirmedAt: null,
    expiresAt,
  }, deleteToken)

  const uploadUrlExpiresAt = new Date(now.getTime() + expiresIn * 1000).toISOString()
  // deleteToken はこのレスポンスでのみ返す。保管しておくことで投稿者自身が削除できる
  return c.json({ data: { imageId, uploadUrl, uploadUrlExpiresAt, contentType: body.contentType, deleteToken } }, 201)
}

// POST /upload/confirm/:imageId
// アップロード完了を通知し、ステータスを pending → active に遷移する
export async function confirmUploadHandler(c: Context<PluginEnv>): Promise<Response> {
  const imageId = c.req.param('imageId')
  const image = await repository.findImageById(c.env.IMAGE_DB, imageId)
  if (!image) return c.json({ error: 'NOT_FOUND', message: 'Image not found' }, 404)

  if (image.status === 'active') {
    // 二重 confirm は冪等に成功を返す
    return c.json({ data: { image, url: buildPublicUrl(c.env, image.storageKey) } })
  }
  if (image.status !== 'pending') {
    return c.json({ error: 'INVALID_STATUS', message: `Image status is ${image.status}` }, 409)
  }

  const confirmedAt = new Date().toISOString()
  await repository.confirmImage(c.env.IMAGE_DB, imageId, confirmedAt)
  const confirmed = { ...image, status: 'active' as const, confirmedAt }
  return c.json({ data: { image: confirmed, url: buildPublicUrl(c.env, image.storageKey) } })
}

// GET /images/:imageId
export async function getImageHandler(c: Context<PluginEnv>): Promise<Response> {
  const imageId = c.req.param('imageId')
  const image = await repository.findImageById(c.env.IMAGE_DB, imageId)
  if (!image || image.status === 'deleted') {
    return c.json({ error: 'NOT_FOUND', message: 'Image not found' }, 404)
  }
  return c.json({ data: { image, url: buildPublicUrl(c.env, image.storageKey) } })
}

// POST /images/:imageId/report
// 画像を通報する (active/reported な画像のみ)
export async function reportImageHandler(c: Context<PluginEnv>): Promise<Response> {
  const imageId = c.req.param('imageId')
  const image = await repository.findImageById(c.env.IMAGE_DB, imageId)
  if (!image || image.status === 'deleted' || image.status === 'pending') {
    return c.json({ error: 'NOT_FOUND', message: 'Image not found' }, 404)
  }
  await repository.reportImage(c.env.IMAGE_DB, imageId)
  return c.json({ data: { message: 'Image reported' } })
}

// DELETE /images/:imageId (管理者のみ)
// ストレージと DB 行の両方を削除する
export async function deleteImageHandler(c: Context<PluginEnv>): Promise<Response> {
  const imageId = c.req.param('imageId')
  const image = await repository.findImageById(c.env.IMAGE_DB, imageId)
  if (!image || image.status === 'deleted') {
    return c.json({ error: 'NOT_FOUND', message: 'Image not found' }, 404)
  }

  try {
    await presign.deleteObject(getStorageConfig(c.env), image.storageKey)
  } catch (e) {
    console.error('[Admin] Storage delete failed:', e)
    return c.json({ error: 'STORAGE_ERROR', message: 'Failed to delete from storage' }, 500)
  }

  await repository.deleteImageRow(c.env.IMAGE_DB, imageId)
  return new Response(null, { status: 204 })
}

// DELETE /images/:imageId/:deleteToken (投稿者自身による削除)
// アップロード時に返した deleteToken を URL に含めることで削除できる
export async function userDeleteImageHandler(c: Context<PluginEnv>): Promise<Response> {
  const imageId = c.req.param('imageId')
  const deleteToken = c.req.param('deleteToken')
  const image = await repository.findImageByDeleteToken(c.env.IMAGE_DB, imageId, deleteToken)
  if (!image || image.status === 'deleted') {
    return c.json({ error: 'NOT_FOUND', message: 'Image not found' }, 404)
  }

  try {
    await presign.deleteObject(getStorageConfig(c.env), image.storageKey)
  } catch (e) {
    console.error('[UserDelete] Storage delete failed:', e)
    return c.json({ error: 'STORAGE_ERROR', message: 'Failed to delete from storage' }, 500)
  }

  await repository.deleteImageRow(c.env.IMAGE_DB, imageId)
  return new Response(null, { status: 204 })
}
