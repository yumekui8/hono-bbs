import { z } from 'zod'
import type { Board, IdFormat } from '../types'
import type { SystemIds } from '../utils/constants'
import type { EndpointPermissionsMap } from '../utils/endpointPermissions'
import { getEndpointPermConfig } from '../utils/endpointPermissions'
import * as boardRepository from '../repository/boardRepository'
import { hasPermission } from '../utils/permission'

const createBoardSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_\-\.]+$/, 'IDは英数字・_・-・. のみ使用できます').optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ownerUserId: z.string().optional(),
  ownerGroupId: z.string().optional(),
  permissions: z.string().regex(/^\d+,\d+,\d+,\d+$/).optional(),
  maxThreads: z.number().int().min(1).max(100000).optional(),
  maxThreadTitleLength: z.number().int().min(1).max(1000).optional(),
  defaultMaxPosts: z.number().int().min(1).optional(),
  defaultMaxPostLength: z.number().int().min(1).optional(),
  defaultMaxPostLines: z.number().int().min(1).optional(),
  defaultMaxPosterNameLength: z.number().int().min(1).optional(),
  defaultMaxPosterSubInfoLength: z.number().int().min(1).optional(),
  defaultMaxPosterMetaInfoLength: z.number().int().min(1).optional(),
  defaultPosterName: z.string().max(50).optional(),
  defaultIdFormat: z.enum(['daily_hash', 'daily_hash_or_user', 'api_key_hash', 'api_key_hash_or_user', 'none']).optional(),
  defaultThreadOwnerUserId: z.string().optional(),
  defaultThreadOwnerGroupId: z.string().optional(),
  defaultThreadPermissions: z.string().regex(/^\d+,\d+,\d+,\d+$/).optional(),
  category: z.string().max(128).optional(),
})

const updateBoardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  ownerUserId: z.string().nullable().optional(),
  ownerGroupId: z.string().nullable().optional(),
  permissions: z.string().regex(/^\d+,\d+,\d+,\d+$/).optional(),
  maxThreads: z.number().int().min(1).max(100000).optional(),
  defaultMaxPosts: z.number().int().min(1).optional(),
  defaultMaxPostLength: z.number().int().min(1).optional(),
  defaultPosterName: z.string().max(50).optional(),
  defaultIdFormat: z.enum(['daily_hash', 'daily_hash_or_user', 'api_key_hash', 'api_key_hash_or_user', 'none']).optional(),
  category: z.string().max(128).nullable().optional(),
})

export type CreateBoardInput = z.infer<typeof createBoardSchema>
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>

export function parseCreateBoard(data: unknown): CreateBoardInput {
  return createBoardSchema.parse(data)
}

export function parseUpdateBoard(data: unknown): UpdateBoardInput {
  return updateBoardSchema.parse(data)
}

export async function getBoards(
  db: D1Database,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
): Promise<Board[]> {
  const boards = await boardRepository.findBoards(db)
  if (isAdmin) return boards
  // 読み取り権限のない板はリストから除外
  return boards.filter(b => hasPermission({
    userId, userGroupIds,
    ownerUserId: b.ownerUserId, ownerGroupId: b.ownerGroupId,
    permissions: b.permissions, operation: 'GET', isAdmin,
  }))
}

// /boards コレクションの POST 権限チェック (板作成権限)
// ENDPOINT_PERMISSIONS の '/boards' 設定に基づいて確認する
export function checkBoardsCollectionPermission(
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
  customPerms: EndpointPermissionsMap,
  sysIds: SystemIds,
): boolean {
  if (isAdmin) return true
  const config = getEndpointPermConfig('/boards', customPerms, sysIds)
  return hasPermission({
    userId, userGroupIds,
    ownerUserId: config.ownerUserId, ownerGroupId: config.ownerGroupId,
    permissions: config.permissions, operation: 'POST', isAdmin,
  })
}

export async function createBoard(
  db: D1Database,
  input: CreateBoardInput,
  creatorUserId: string | null,
  creatorPrimaryGroupId: string | null,
  creatorSessionId: string | null,
  creatorTurnstileSessionId: string | null,
): Promise<Board> {
  const board: Board = {
    id: input.id ?? crypto.randomUUID(),
    ownerUserId: input.ownerUserId ?? creatorUserId,
    ownerGroupId: input.ownerGroupId ?? creatorPrimaryGroupId,
    // "owner,group,auth,anon" 形式: owner=全操作, group=全操作-DELETE, auth=GET+POST, anon=GET+POST
    permissions: input.permissions ?? '15,14,12,12',
    name: input.name,
    description: input.description ?? null,
    maxThreads: input.maxThreads ?? 1000,
    maxThreadTitleLength: input.maxThreadTitleLength ?? 200,
    defaultMaxPosts: input.defaultMaxPosts ?? 1000,
    defaultMaxPostLength: input.defaultMaxPostLength ?? 2000,
    defaultMaxPostLines: input.defaultMaxPostLines ?? 100,
    defaultMaxPosterNameLength: input.defaultMaxPosterNameLength ?? 50,
    defaultMaxPosterSubInfoLength: input.defaultMaxPosterSubInfoLength ?? 100,
    defaultMaxPosterMetaInfoLength: input.defaultMaxPosterMetaInfoLength ?? 200,
    defaultPosterName: input.defaultPosterName ?? '名無し',
    defaultIdFormat: input.defaultIdFormat ?? 'daily_hash',
    defaultThreadOwnerUserId: input.defaultThreadOwnerUserId ?? null,
    defaultThreadOwnerGroupId: input.defaultThreadOwnerGroupId ?? null,
    defaultThreadPermissions: input.defaultThreadPermissions ?? '15,14,12,12',
    category: input.category ?? null,
    createdAt: new Date().toISOString(),
    adminMeta: { creatorUserId, creatorSessionId, creatorTurnstileSessionId },
  }
  await boardRepository.insertBoard(db, board)
  return board
}

export async function updateBoard(
  db: D1Database,
  boardId: string,
  input: UpdateBoardInput,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
): Promise<Board | null> {
  const board = await boardRepository.findBoardById(db, boardId)
  if (!board) return null

  if (!hasPermission({ userId, userGroupIds, ownerUserId: board.ownerUserId, ownerGroupId: board.ownerGroupId, permissions: board.permissions, operation: 'PUT', isAdmin })) {
    throw new Error('FORBIDDEN')
  }

  await boardRepository.updateBoard(db, boardId, input)
  return boardRepository.findBoardById(db, boardId)
}

export async function deleteBoard(
  db: D1Database,
  boardId: string,
  userId: string | null,
  userGroupIds: string[],
  isAdmin: boolean,
): Promise<boolean> {
  const board = await boardRepository.findBoardById(db, boardId)
  if (!board) return false

  if (!hasPermission({ userId, userGroupIds, ownerUserId: board.ownerUserId, ownerGroupId: board.ownerGroupId, permissions: board.permissions, operation: 'DELETE', isAdmin })) {
    throw new Error('FORBIDDEN')
  }

  return boardRepository.deleteBoard(db, boardId)
}
