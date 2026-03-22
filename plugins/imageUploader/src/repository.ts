import type { Image, ImageStatus } from './types'

type ImageRow = {
  id: string
  storage_key: string
  original_filename: string | null
  content_type: string
  size: number | null
  status: string
  turnstile_session_id: string | null
  report_count: number
  created_at: string
  confirmed_at: string | null
  expires_at: string | null
  delete_token: string | null
}

function toImage(row: ImageRow): Image {
  return {
    id: row.id,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    size: row.size,
    status: row.status as ImageStatus,
    turnstileSessionId: row.turnstile_session_id,
    reportCount: row.report_count,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    expiresAt: row.expires_at,
  }
}

export async function createImage(db: D1Database, image: Image, deleteToken: string): Promise<void> {
  await db.prepare(`
    INSERT INTO images
      (id, storage_key, original_filename, content_type, size, status,
       turnstile_session_id, report_count, created_at, confirmed_at, expires_at, delete_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    image.id, image.storageKey, image.originalFilename, image.contentType, image.size,
    image.status, image.turnstileSessionId, image.reportCount,
    image.createdAt, image.confirmedAt, image.expiresAt, deleteToken,
  ).run()
}

// deleteToken で画像を検索する (投稿者自身による削除用)
export async function findImageByDeleteToken(
  db: D1Database, id: string, deleteToken: string,
): Promise<Image | null> {
  const row = await db.prepare(
    'SELECT * FROM images WHERE id = ? AND delete_token = ?',
  ).bind(id, deleteToken).first<ImageRow>()
  return row ? toImage(row) : null
}

export async function findImageById(db: D1Database, id: string): Promise<Image | null> {
  const row = await db.prepare('SELECT * FROM images WHERE id = ?').bind(id).first<ImageRow>()
  return row ? toImage(row) : null
}

// status を pending → active に遷移する (pending 以外は変更しない)
export async function confirmImage(db: D1Database, id: string, confirmedAt: string): Promise<void> {
  await db.prepare(
    "UPDATE images SET status = 'active', confirmed_at = ? WHERE id = ? AND status = 'pending'",
  ).bind(confirmedAt, id).run()
}

export async function updateStatus(db: D1Database, id: string, status: ImageStatus): Promise<void> {
  await db.prepare('UPDATE images SET status = ? WHERE id = ?').bind(status, id).run()
}

// 通報数をインクリメントし、active の場合は reported に遷移する
export async function reportImage(db: D1Database, id: string): Promise<void> {
  await db.prepare(`
    UPDATE images
    SET report_count = report_count + 1,
        status = CASE WHEN status = 'active' THEN 'reported' ELSE status END
    WHERE id = ? AND status NOT IN ('deleted', 'pending')
  `).bind(id).run()
}

// DB レコードを物理削除する
export async function deleteImageRow(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM images WHERE id = ?').bind(id).run()
}

// status = 'deleted' のレコードを最大 100 件取得する (Cron 物理削除用)
export async function findDeletedImages(db: D1Database): Promise<Image[]> {
  const result = await db.prepare(
    "SELECT * FROM images WHERE status = 'deleted' LIMIT 100",
  ).all<ImageRow>()
  return (result.results ?? []).map(toImage)
}

// original_filename と size が両方 null で指定時刻より前の pending 画像を取得する (Cron 削除用)
// メタデータなしで放棄されたアップロードを素早く回収する
export async function findAbandonedWithoutMetadata(db: D1Database, before: string): Promise<Image[]> {
  const result = await db.prepare(
    "SELECT * FROM images WHERE status = 'pending' AND original_filename IS NULL AND size IS NULL AND created_at < ? LIMIT 100",
  ).bind(before).all<ImageRow>()
  return (result.results ?? []).map(toImage)
}

// 期限切れ画像を最大 100 件取得する (Cron 削除用)
export async function findExpiredImages(db: D1Database, before: string): Promise<Image[]> {
  const result = await db.prepare(
    "SELECT * FROM images WHERE expires_at IS NOT NULL AND expires_at < ? AND status != 'deleted' LIMIT 100",
  ).bind(before).all<ImageRow>()
  return (result.results ?? []).map(toImage)
}

// 1 時間以上 pending のまま放置された画像を最大 100 件取得する (Cron 削除用)
export async function findAbandonedPendingImages(db: D1Database, before: string): Promise<Image[]> {
  const result = await db.prepare(
    "SELECT * FROM images WHERE status = 'pending' AND created_at < ? LIMIT 100",
  ).bind(before).all<ImageRow>()
  return (result.results ?? []).map(toImage)
}
