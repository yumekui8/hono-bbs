import type { SystemIds } from './constants'

export type EndpointPermConfig = {
  ownerUserId: string | null
  ownerGroupId: string | null
  permissions: string
}

export type EndpointPermissionsMap = Record<string, EndpointPermConfig>

// エンドポイントコレクションのデフォルト権限設定
// permissions 形式: "owner,group,auth,anon" (各値は操作ビットマスク: DELETE=1, PUT=2, POST=4, GET=8)
// 例: "15,15,8,8" → owner: 全操作, group: 全操作, auth: GETのみ, anon: GETのみ
const DEFAULT_ENDPOINT_PERMISSIONS: EndpointPermissionsMap = {
  '/auth/setup':      { ownerUserId: '$SYS_ADMIN', ownerGroupId: '$BBS_ADMIN_GROUP', permissions: '15,15,12,12' },
  '/auth/login':      { ownerUserId: '$SYS_ADMIN', ownerGroupId: '$BBS_ADMIN_GROUP', permissions: '15,15,12,12' },
  '/auth/logout':     { ownerUserId: '$SYS_ADMIN', ownerGroupId: '$BBS_ADMIN_GROUP', permissions: '15,15,8,0'   },
  '/profile':         { ownerUserId: '$SYS_ADMIN', ownerGroupId: '$USER_ADMIN_GROUP', permissions: '15,15,8,0'  },
  '/identity/users':  { ownerUserId: '$SYS_ADMIN', ownerGroupId: '$USER_ADMIN_GROUP', permissions: '15,15,0,0'  },
  '/identity/groups': { ownerUserId: '$SYS_ADMIN', ownerGroupId: '$USER_ADMIN_GROUP', permissions: '15,15,0,0'  },
  // /boards: 板作成は bbsAdminGroup のみ。auth/anon は GET のみ
  '/boards':          { ownerUserId: '$SYS_ADMIN', ownerGroupId: '$BBS_ADMIN_GROUP', permissions: '15,15,8,8'   },
}

// $SYS_ADMIN / $USER_ADMIN_GROUP / $BBS_ADMIN_GROUP をシステムIDに解決する
function resolvePlaceholder(value: string | null, sysIds: SystemIds): string | null {
  if (value === null) return null
  if (value === '$SYS_ADMIN')          return sysIds.adminUserId
  if (value === '$USER_ADMIN_GROUP')   return sysIds.userAdminGroupId
  if (value === '$BBS_ADMIN_GROUP')    return sysIds.bbsAdminGroupId
  return value
}

// ENDPOINT_PERMISSIONS 環境変数 (JSON文字列) をパースする
// デフォルト値とマージして返す (カスタム設定がデフォルトを上書き)
export function parseEndpointPermissions(json: string | undefined): EndpointPermissionsMap {
  if (!json) return {}
  try {
    return JSON.parse(json) as EndpointPermissionsMap
  } catch {
    return {}
  }
}

// 指定パスのエンドポイント権限設定を取得し、プレースホルダーを解決して返す
export function getEndpointPermConfig(
  path: string,
  customMap: EndpointPermissionsMap,
  sysIds: SystemIds,
): EndpointPermConfig {
  const raw = customMap[path] ?? DEFAULT_ENDPOINT_PERMISSIONS[path]
  if (!raw) {
    // フォールバック: owner=admin, group=bbsAdmin, auth/anon=GETのみ
    return { ownerUserId: sysIds.adminUserId, ownerGroupId: sysIds.bbsAdminGroupId, permissions: '15,15,8,8' }
  }
  return {
    ownerUserId:  resolvePlaceholder(raw.ownerUserId, sysIds),
    ownerGroupId: resolvePlaceholder(raw.ownerGroupId, sysIds),
    permissions:  raw.permissions,
  }
}
