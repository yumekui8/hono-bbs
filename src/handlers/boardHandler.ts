import type { Context } from 'hono'
import { isZodError, zodMessage } from '../utils/zodHelper'
import type { AppEnv, Board } from '../types'
import * as boardService from '../services/boardService'
import { getSystemIds } from '../utils/constants'
import { parseEndpointPermissions, getEndpointPermConfig } from '../utils/endpointPermissions'

// userAdminGroup または bbsAdminGroup メンバーのみ adminMeta を参照できる
function adminVisible(c: Context<AppEnv>): boolean {
  return c.get('isAdmin') || c.get('isUserAdmin')
}

function stripAdminMeta(board: Board, visible: boolean): Board | Omit<Board, 'adminMeta'> {
  if (visible) return board
  const { adminMeta: _dropped, ...rest } = board
  return rest
}

// GET /boards
export async function getBoardsHandler(c: Context<AppEnv>): Promise<Response> {
  const boards = await boardService.getBoards(c.env.DB, c.get('userId'), c.get('userGroupIds'), c.get('isAdmin'))
  const visible = adminVisible(c)
  const sysIds = getSystemIds(c.env)
  const customPerms = parseEndpointPermissions(c.env.ENDPOINT_PERMISSIONS)
  const endpointConfig = getEndpointPermConfig('/boards', customPerms, sysIds)
  return c.json({
    data: boards.map(b => stripAdminMeta(b, visible)),
    endpoint: endpointConfig,
  })
}

// POST /boards
export async function createBoardHandler(c: Context<AppEnv>): Promise<Response> {
  const sysIds = getSystemIds(c.env)
  const customPerms = parseEndpointPermissions(c.env.ENDPOINT_PERMISSIONS)

  // /boards コレクションの POST 権限チェック
  const allowed = boardService.checkBoardsCollectionPermission(
    c.get('userId'), c.get('userGroupIds'), c.get('isAdmin'),
    customPerms, sysIds,
  )
  if (!allowed) {
    return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions to create board' }, 403)
  }

  try {
    const body = await c.req.json()
    const input = boardService.parseCreateBoard(body)
    const board = await boardService.createBoard(
      c.env.DB, input, c.get('userId'), c.get('primaryGroupId'),
      c.req.header('X-Session-Id') ?? null,
      c.req.header('X-Turnstile-Session') ?? null,
    )
    return c.json({ data: stripAdminMeta(board, adminVisible(c)) }, 201)
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    throw e
  }
}

// PUT /boards/:boardId
export async function updateBoardHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  try {
    const body = await c.req.json()
    const input = boardService.parseUpdateBoard(body)
    const board = await boardService.updateBoard(
      c.env.DB, boardId, input,
      c.get('userId'), c.get('userGroupIds'), c.get('isAdmin'),
    )
    if (!board) return c.json({ error: 'BOARD_NOT_FOUND', message: 'Board not found' }, 404)
    return c.json({ data: stripAdminMeta(board, adminVisible(c)) })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
    }
    throw e
  }
}

// DELETE /boards/:boardId
export async function deleteBoardHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  try {
    const deleted = await boardService.deleteBoard(
      c.env.DB, boardId,
      c.get('userId'), c.get('userGroupIds'), c.get('isAdmin'),
    )
    if (!deleted) return c.json({ error: 'BOARD_NOT_FOUND', message: 'Board not found' }, 404)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
    }
    throw e
  }
}
