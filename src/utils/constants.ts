// 環境変数から解決するシステムID定数のデフォルト値
export const DEFAULT_ADMIN_USER_ID       = 'admin'
export const DEFAULT_ADMIN_GROUP_ID      = 'admin-group'
export const DEFAULT_USER_ADMIN_GROUP_ID = 'user-admin-group'
export const DEFAULT_BBS_ADMIN_GROUP_ID  = 'bbs-admin-group'
export const DEFAULT_GENERAL_GROUP_ID    = 'general-group'

export type SystemIds = {
  adminUserId: string       // 管理者ユーザID (ADMIN_USERNAME)
  adminGroupId: string      // 管理者プライマリグループID
  userAdminGroupId: string  // ユーザ管理グループID (USER_ADMIN_GROUP)
  bbsAdminGroupId: string   // 掲示板管理グループID (BBS_ADMIN_GROUP)
  generalGroupId: string    // 新規ユーザのデフォルトグループID
}

// 環境変数から SystemIds を生成する
export function getSystemIds(env: {
  ADMIN_USERNAME?: string
  USER_ADMIN_GROUP?: string
  BBS_ADMIN_GROUP?: string
}): SystemIds {
  const adminUserId = env.ADMIN_USERNAME ?? DEFAULT_ADMIN_USER_ID
  return {
    adminUserId,
    adminGroupId:     `${adminUserId}-group`,
    userAdminGroupId: env.USER_ADMIN_GROUP ?? DEFAULT_USER_ADMIN_GROUP_ID,
    bbsAdminGroupId:  env.BBS_ADMIN_GROUP  ?? DEFAULT_BBS_ADMIN_GROUP_ID,
    generalGroupId:   DEFAULT_GENERAL_GROUP_ID,
  }
}
