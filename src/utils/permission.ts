// パーミッション形式: "admins,members,users,anon"
// 各値は操作ビットマスク: GET=16, POST=8, PUT=4, PATCH=2, DELETE=1
// 例: "31,28,24,16" → admins: 全操作, members: GET+POST+PUT, users: GET+POST, anon: GETのみ
//
// 階層: admins ⊇ members ⊇ users ⊇ anon
// (各レベルは下位のビットを OR で継承)

export type Operation = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const OP_BIT: Record<Operation, number> = { GET: 16, POST: 8, PUT: 4, PATCH: 2, DELETE: 1 }

export function parsePermissions(perms: string): { admin: number; member: number; user: number; anon: number } {
  const parts = perms.split(',').map(Number)
  return {
    admin:  parts[0] ?? 31,
    member: parts[1] ?? 28,
    user:   parts[2] ?? 24,
    anon:   parts[3] ?? 16,
  }
}

export function formatPermissions(admin: number, member: number, user: number, anon: number): string {
  return `${admin},${member},${user},${anon}`
}

function splitList(s: string): string[] {
  return s.split(',').map(t => t.trim()).filter(Boolean)
}

function inList(userId: string | null, roleIds: string[], list: string[]): boolean {
  if (!userId) return false
  if (list.includes(userId)) return true
  return roleIds.some(r => list.includes(r))
}

// 指定操作の権限を持つか確認
// isSysAdmin=true の場合は常に許可 (全権限バイパス)
export function hasPermission(params: {
  userId: string | null
  userRoleIds: string[]
  administrators: string
  members: string
  permissions: string
  operation: Operation
  isSysAdmin: boolean
}): boolean {
  if (params.isSysAdmin) return true

  const parsed = parsePermissions(params.permissions)
  const bit = OP_BIT[params.operation]

  // Administrators チェック (admin | member | user | anon の継承)
  const adminList = splitList(params.administrators)
  if (inList(params.userId, params.userRoleIds, adminList)) {
    return ((parsed.admin | parsed.member | parsed.user | parsed.anon) & bit) !== 0
  }

  // Members チェック (member | user | anon の継承)
  const memberList = splitList(params.members)
  if (inList(params.userId, params.userRoleIds, memberList)) {
    return ((parsed.member | parsed.user | parsed.anon) & bit) !== 0
  }

  // ログイン済みユーザ (Users: user | anon の継承)
  if (params.userId) {
    return ((parsed.user | parsed.anon) & bit) !== 0
  }

  // 匿名
  return (parsed.anon & bit) !== 0
}

// $CREATOR / $PARENTS テンプレートを展開して administrators/members 文字列を生成する
// creator: 作成者のユーザID (null の場合は匿名、$CREATOR はスキップ)
// parents: 親リソースの administrators または members の文字列 ($PARENTS に展開)
export function expandTemplate(
  template: string,
  creator: string | null,
  parents: string,
): string {
  const parts = splitList(template)
  const result: string[] = []

  for (const part of parts) {
    if (part === '$CREATOR') {
      if (creator) result.push(creator)
    } else if (part === '$PARENTS') {
      result.push(...splitList(parents))
    } else {
      result.push(part)
    }
  }

  // 重複排除して返す
  return [...new Set(result)].join(',')
}

// permissions 文字列の各値が 0-31 の範囲内か検証
export function isValidPermissions(perms: string): boolean {
  const parts = perms.split(',')
  if (parts.length !== 4) return false
  return parts.every(p => {
    const n = parseInt(p, 10)
    return !isNaN(n) && n >= 0 && n <= 31
  })
}
