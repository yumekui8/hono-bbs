import * as presign from './presign'
import * as repository from './repository'
import type { PluginEnv } from './types'

function getStorageConfig(env: PluginEnv['Bindings']): presign.StorageConfig {
  return {
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  }
}

// 期限切れ画像および 1 時間以上 pending のままの放棄画像を削除する
// Cron Trigger から呼び出す (wrangler.jsonc の triggers.crons で設定)
export async function runCleanup(env: PluginEnv['Bindings']): Promise<{ deleted: number; errors: number }> {
  const storage = getStorageConfig(env)
  const now = new Date().toISOString()
  const abandonedBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const [expired, abandoned] = await Promise.all([
    repository.findExpiredImages(env.IMAGE_DB, now),
    repository.findAbandonedPendingImages(env.IMAGE_DB, abandonedBefore),
  ])

  let deleted = 0
  let errors = 0

  // ストレージ削除 → DB レコード物理削除
  for (const image of [...expired, ...abandoned]) {
    try {
      await presign.deleteObject(storage, image.storageKey)
      await repository.deleteImageRow(env.IMAGE_DB, image.id)
      deleted++
    } catch (e) {
      console.error(`[Cleanup] Failed to delete image ${image.id}:`, e)
      errors++
    }
  }

  return { deleted, errors }
}
