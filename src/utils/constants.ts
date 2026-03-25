// 環境変数から解決するシステムID定数のデフォルト値
export const DEFAULT_ADMIN_USER_ID      = 'admin'
export const DEFAULT_ADMIN_ROLE_ID      = 'admin-role'
export const DEFAULT_USER_ADMIN_ROLE_ID = 'user-admin-role'
export const DEFAULT_GENERAL_ROLE_ID    = 'general-role'

export type SystemIds = {
  adminUserId: string
  adminRoleId: string       // 管理者ロールID
  userAdminRoleId: string   // ユーザ管理ロールID
  generalRoleId: string     // 新規ユーザのデフォルトロールID
}

// 環境変数から SystemIds を生成する
export function getSystemIds(env: {
  ADMIN_USERNAME?: string
  USER_ADMIN_ROLE?: string
}): SystemIds {
  const adminUserId = env.ADMIN_USERNAME ?? DEFAULT_ADMIN_USER_ID
  return {
    adminUserId,
    adminRoleId:     `${adminUserId}-role`,
    userAdminRoleId: env.USER_ADMIN_ROLE ?? DEFAULT_USER_ADMIN_ROLE_ID,
    generalRoleId:   DEFAULT_GENERAL_ROLE_ID,
  }
}
