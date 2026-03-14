// パーミッション形式: "owner,group,auth,anon"
// 各値は操作ビットマスク: DELETE=1, PUT=2, POST=4, GET=8
// 例: "15,12,12,8" → owner: 全操作, group: GET+POST+PUT, auth: GET+POST, anon: GETのみ
//
// 注意: 4操作のビットマスクは 0〜15 の範囲 (2^4 = 16 通りの組み合わせ)
// 「全操作許可」= 15 (DELETE+PUT+POST+GET = 1+2+4+8 = 15)
// 「GETのみ」   =  8

export type Operation = 'GET' | 'POST' | 'PUT' | 'DELETE'

// パーミッション文字列を各ユーザ種別のマスクに分解
export function parsePermissions(perms: string): { owner: number; group: number; auth: number; anon: number } {
  const parts = perms.split(',').map(Number)
  return {
    owner: parts[0] ?? 15,
    group: parts[1] ?? 15,
    auth:  parts[2] ?? 12,  // デフォルト: GET+POST
    anon:  parts[3] ?? 8,   // デフォルト: GET のみ
  }
}

export function formatPermissions(owner: number, group: number, auth: number, anon: number): string {
  return `${owner},${group},${auth},${anon}`
}

// 指定操作の権限を持つか確認
// isAdmin=true の場合は常に許可
export function hasPermission(params: {
  userId: string | null
  userGroupIds: string[]
  ownerUserId: string | null
  ownerGroupId: string | null
  permissions: string
  operation: Operation
  isAdmin: boolean
}): boolean {
  if (params.isAdmin) return true

  const parsed = parsePermissions(params.permissions)

  // 操作ビット: DELETE=1, PUT=2, POST=4, GET=8
  const opBit: Record<Operation, number> = { DELETE: 1, PUT: 2, POST: 4, GET: 8 }
  const bit = opBit[params.operation]

  // オーナーチェック (userId が一致する場合)
  if (params.userId && params.userId === params.ownerUserId) {
    return (parsed.owner & bit) !== 0
  }

  // グループチェック (ownerGroupId が userGroupIds に含まれる場合)
  if (params.ownerGroupId && params.userGroupIds.includes(params.ownerGroupId)) {
    return (parsed.group & bit) !== 0
  }

  // ログイン済みユーザー
  if (params.userId) {
    return (parsed.auth & bit) !== 0
  }

  // 匿名ユーザー
  return (parsed.anon & bit) !== 0
}
