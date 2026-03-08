import type { Context } from 'hono'
import { isZodError, zodMessage } from '../utils/zodHelper'
import type { AppEnv, Board } from '../types'
import * as boardService from '../services/boardService'
import { SYSTEM_USER_ADMIN_GROUP_ID, SYSTEM_BBS_ADMIN_GROUP_ID } from '../utils/constants'

// userAdminGroup または bbsAdminGroup メンバーのみ adminMeta を参照できる
function adminVisible(c: Context<AppEnv>): boolean {
  const groups = c.get('userGroupIds')
  return groups.includes(SYSTEM_USER_ADMIN_GROUP_ID) || groups.includes(SYSTEM_BBS_ADMIN_GROUP_ID)
}

function stripAdminMeta(board: Board, visible: boolean): Board | Omit<Board, 'adminMeta'> {
  if (visible) return board
  const { adminMeta: _dropped, ...rest } = board
  return rest
}

export async function getBoardsHandler(c: Context<AppEnv>): Promise<Response> {
  const boards = await boardService.getBoards(c.env.DB)
  const visible = adminVisible(c)
  return c.json({ data: boards.map(b => stripAdminMeta(b, visible)) })
}

export async function createBoardHandler(c: Context<AppEnv>): Promise<Response> {
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
