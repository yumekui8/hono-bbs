import { z } from 'zod'
import type { Board } from '../types'
import type { DbAdapter } from '../adapters/db'
import * as boardRepository from '../repository/boardRepository'
import { hasPermission, expandTemplate, isValidPermissions } from '../utils/permission'

const ID_FORMATS = ['daily_hash', 'daily_hash_or_user', 'api_key_hash', 'api_key_hash_or_user', 'none'] as const

const permissionsField = z.string().refine(isValidPermissions, {
  message: 'permissions は "admins,members,users,anon" 形式で各値 0-31 の整数を指定してください',
})

// POST /boards および PATCH /boards/:boardId (upsert) で使用
const boardBodySchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_\-\.]+$/, 'IDは英数字・_・-・. のみ使用できます').optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  administrators: z.string().max(500).optional(),
  members: z.string().max(500).optional(),
  permissions: permissionsField,
  maxThreads: z.number().int().min(0),
  maxThreadTitleLength: z.number().int().min(0),
  defaultMaxPosts: z.number().int().min(0),
  defaultMaxPostLength: z.number().int().min(0),
  defaultMaxPostLines: z.number().int().min(0),
  defaultMaxPosterNameLength: z.number().int().min(0),
  defaultMaxPosterOptionLength: z.number().int().min(0),
  defaultPosterName: z.string().min(1).max(50),
  defaultIdFormat: z.enum(ID_FORMATS),
  defaultThreadAdministrators: z.string().max(500),
  defaultThreadMembers: z.string().max(500).optional(),
  defaultThreadPermissions: permissionsField,
  defaultPostAdministrators: z.string().max(500),
  defaultPostMembers: z.string().max(500).optional(),
  defaultPostPermissions: permissionsField,
  category: z.string().max(128).optional(),
})

// PUT /boards/:boardId (name/description/category のみ更新可)
const updateBoardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().max(128).optional(),
})

export type BoardBodyInput = z.infer<typeof boardBodySchema>
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>

export function parseBoardBody(data: unknown): BoardBodyInput {
  return boardBodySchema.parse(data)
}

export function parseUpdateBoard(data: unknown): UpdateBoardInput {
  return updateBoardSchema.parse(data)
}

function buildBoardFromInput(
  id: string,
  input: BoardBodyInput,
  creatorUserId: string | null,
  creatorSessionId: string | null,
  creatorTurnstileSessionId: string | null,
  now: string,
): Board {
  // administrators: 省略時は作成者を追加
  const administrators = expandTemplate(
    input.administrators ?? (creatorUserId ? '$CREATOR' : ''),
    creatorUserId,
    '',
  )

  return {
    id,
    administrators,
    members: input.members ?? '',
    permissions: input.permissions,
    name: input.name,
    description: input.description,
    maxThreads: input.maxThreads,
    maxThreadTitleLength: input.maxThreadTitleLength,
    defaultMaxPosts: input.defaultMaxPosts,
    defaultMaxPostLength: input.defaultMaxPostLength,
    defaultMaxPostLines: input.defaultMaxPostLines,
    defaultMaxPosterNameLength: input.defaultMaxPosterNameLength,
    defaultMaxPosterOptionLength: input.defaultMaxPosterOptionLength,
    defaultPosterName: input.defaultPosterName,
    defaultIdFormat: input.defaultIdFormat,
    // defaultThread/PostAdministrators はテンプレートのまま保存 (スレッド/レス作成時に展開)
    defaultThreadAdministrators: input.defaultThreadAdministrators,
    defaultThreadMembers: input.defaultThreadMembers ?? '',
    defaultThreadPermissions: input.defaultThreadPermissions,
    defaultPostAdministrators: input.defaultPostAdministrators,
    defaultPostMembers: input.defaultPostMembers ?? '',
    defaultPostPermissions: input.defaultPostPermissions,
    category: input.category ?? '',
    createdAt: now,
    adminMeta: { creatorUserId, creatorSessionId, creatorTurnstileSessionId },
  }
}

export async function getBoards(
  db: DbAdapter,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
): Promise<Board[]> {
  const boards = await boardRepository.findBoards(db)
  if (isSysAdmin) return boards
  return boards.filter(b => hasPermission({
    userId, userRoleIds,
    administrators: b.administrators, members: b.members,
    permissions: b.permissions, operation: 'GET', isSysAdmin,
  }))
}

// POST /boards: sys admin のみ作成可
export async function createBoard(
  db: DbAdapter,
  input: BoardBodyInput,
  creatorUserId: string | null,
  isSysAdmin: boolean,
  creatorSessionId: string | null,
  creatorTurnstileSessionId: string | null,
): Promise<Board> {
  if (!isSysAdmin) throw new Error('FORBIDDEN')

  const now = new Date().toISOString()
  const id = input.id ?? crypto.randomUUID()

  const board = buildBoardFromInput(id, input, creatorUserId, creatorSessionId, creatorTurnstileSessionId, now)
  await boardRepository.insertBoard(db, board)
  return board
}

// PUT /boards/:boardId: name/description/category のみ更新
export async function putBoard(
  db: DbAdapter,
  boardId: string,
  input: UpdateBoardInput,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
): Promise<Board | null> {
  const board = await boardRepository.findBoardById(db, boardId)
  if (!board) return null

  if (!hasPermission({
    userId, userRoleIds,
    administrators: board.administrators, members: board.members,
    permissions: board.permissions, operation: 'PUT', isSysAdmin,
  })) throw new Error('FORBIDDEN')

  await boardRepository.updateBoard(db, boardId, {
    name: input.name,
    description: input.description,
    category: input.category,
  })
  return boardRepository.findBoardById(db, boardId)
}

// PATCH /boards/:boardId: upsert (存在しない場合は sys admin のみ作成可)
export async function patchBoard(
  db: DbAdapter,
  boardId: string,
  input: BoardBodyInput,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
  creatorSessionId: string | null,
  creatorTurnstileSessionId: string | null,
): Promise<Board> {
  const existing = await boardRepository.findBoardById(db, boardId)

  if (!existing) {
    // 存在しない場合: sys admin のみ作成可
    if (!isSysAdmin) throw new Error('FORBIDDEN')
    const now = new Date().toISOString()
    const board = buildBoardFromInput(boardId, input, userId, creatorSessionId, creatorTurnstileSessionId, now)
    await boardRepository.insertBoard(db, board)
    return board
  }

  // 存在する場合: PATCH 権限チェック
  if (!hasPermission({
    userId, userRoleIds,
    administrators: existing.administrators, members: existing.members,
    permissions: existing.permissions, operation: 'PATCH', isSysAdmin,
  })) throw new Error('FORBIDDEN')

  const administrators = expandTemplate(
    input.administrators ?? (userId ? '$CREATOR' : ''),
    userId,
    '',
  )

  await boardRepository.updateBoard(db, boardId, {
    administrators,
    members: input.members ?? '',
    permissions: input.permissions,
    name: input.name,
    description: input.description,
    maxThreads: input.maxThreads,
    maxThreadTitleLength: input.maxThreadTitleLength,
    defaultMaxPosts: input.defaultMaxPosts,
    defaultMaxPostLength: input.defaultMaxPostLength,
    defaultMaxPostLines: input.defaultMaxPostLines,
    defaultMaxPosterNameLength: input.defaultMaxPosterNameLength,
    defaultMaxPosterOptionLength: input.defaultMaxPosterOptionLength,
    defaultPosterName: input.defaultPosterName,
    defaultIdFormat: input.defaultIdFormat,
    defaultThreadAdministrators: input.defaultThreadAdministrators,
    defaultThreadMembers: input.defaultThreadMembers ?? '',
    defaultThreadPermissions: input.defaultThreadPermissions,
    defaultPostAdministrators: input.defaultPostAdministrators,
    defaultPostMembers: input.defaultPostMembers ?? '',
    defaultPostPermissions: input.defaultPostPermissions,
    category: input.category ?? '',
  })
  return (await boardRepository.findBoardById(db, boardId))!
}

export async function deleteBoard(
  db: DbAdapter,
  boardId: string,
  userId: string | null,
  userRoleIds: string[],
  isSysAdmin: boolean,
): Promise<boolean> {
  const board = await boardRepository.findBoardById(db, boardId)
  if (!board) return false

  if (!hasPermission({
    userId, userRoleIds,
    administrators: board.administrators, members: board.members,
    permissions: board.permissions, operation: 'DELETE', isSysAdmin,
  })) throw new Error('FORBIDDEN')

  return boardRepository.deleteBoard(db, boardId)
}
