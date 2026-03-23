import type { BbsRoot } from '../types'
import type { DbAdapter } from '../adapters/db'

type BbsRootRow = {
  id: string
  owner_user_id: string | null
  owner_group_id: string | null
  permissions: string
}

function rowToBbsRoot(row: BbsRootRow): BbsRoot {
  return {
    ownerUserId: row.owner_user_id,
    ownerGroupId: row.owner_group_id,
    permissions: row.permissions,
  }
}

export async function findBbsRoot(db: DbAdapter): Promise<BbsRoot | null> {
  const row = await db.first<BbsRootRow>("SELECT * FROM bbs_root WHERE id = '__root__'")
  return row ? rowToBbsRoot(row) : null
}

export async function updateBbsRoot(
  db: DbAdapter,
  updates: {
    ownerUserId?: string | null
    ownerGroupId?: string | null
    permissions?: string
  },
): Promise<boolean> {
  const fields: string[] = []
  const values: unknown[] = []

  if ('ownerUserId' in updates)   { fields.push('owner_user_id = ?');  values.push(updates.ownerUserId ?? null) }
  if ('ownerGroupId' in updates)  { fields.push('owner_group_id = ?'); values.push(updates.ownerGroupId ?? null) }
  if (updates.permissions !== undefined) { fields.push('permissions = ?'); values.push(updates.permissions) }

  if (fields.length === 0) return true
  const result = await db.run(
    `UPDATE bbs_root SET ${fields.join(', ')} WHERE id = '__root__'`,
    values,
  )
  return result.changes > 0
}
