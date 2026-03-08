// パーミッションビットマスク (UNIXスタイル)
// 8=読取(r) 4=書込(w) 2=削除(d) 1=管理(a)
export const PERM = {
  READ:   8,
  WRITE:  4,
  DELETE: 2,
  ADMIN:  1,
} as const

// パーミッション文字列 "15,12,8" → { owner, group, other }
// デフォルト: owner=15(rwda) group=12(rw) other=8(r)
export function parsePermissions(perms: string): { owner: number; group: number; other: number } {
  const parts = perms.split(',').map(Number)
  return {
    owner: parts[0] ?? 15,
    group: parts[1] ?? 12,
    other: parts[2] ?? 8,
  }
}

export function formatPermissions(owner: number, group: number, other: number): string {
  return `${owner},${group},${other}`
}

// 指定アクションの権限を持つか確認
export function hasPermission(params: {
  userId: string | null
  userGroupIds: string[]
  ownerUserId: string | null
  ownerGroupId: string | null
  permissions: string
  required: number
  isAdmin: boolean
}): boolean {
  if (params.isAdmin) return true

  const { owner, group, other } = parsePermissions(params.permissions)

  // オーナーチェック
  if (params.userId && params.userId === params.ownerUserId) {
    return (owner & params.required) === params.required
  }

  // グループチェック
  if (params.ownerGroupId && params.userGroupIds.includes(params.ownerGroupId)) {
    return (group & params.required) === params.required
  }

  // その他
  return (other & params.required) === params.required
}
