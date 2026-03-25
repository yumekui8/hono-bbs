import type { Context } from 'hono'
import { isZodError, zodMessage } from '../utils/zodHelper'
import type { AppEnv, Board } from '../types'
import * as boardService from '../services/boardService'

// isSysAdmin または isUserAdmin のみ adminMeta を参照できる
function adminVisible(c: Context<AppEnv>): boolean {
  return c.get('isSysAdmin') || c.get('isUserAdmin')
}

function stripAdminMeta(board: Board, visible: boolean): Board | Omit<Board, 'adminMeta'> {
  if (visible) return board
  const { adminMeta: _dropped, ...rest } = board
  return rest
}

// GET /boards
export async function getBoardsHandler(c: Context<AppEnv>): Promise<Response> {
  const boards = await boardService.getBoards(c.get('db'), c.get('userId'), c.get('userRoleIds'), c.get('isSysAdmin'))
  const visible = adminVisible(c)
  return c.json({ data: boards.map(b => stripAdminMeta(b, visible)) })
}

// POST /boards (sys admin のみ)
export async function createBoardHandler(c: Context<AppEnv>): Promise<Response> {
  try {
    const body = await c.req.json()
    const input = boardService.parseBoardBody(body)
    const board = await boardService.createBoard(
      c.get('db'), input, c.get('userId'), c.get('isSysAdmin'),
      c.req.header('X-Session-Id') ?? null,
      c.req.header('X-Turnstile-Session') ?? null,
    )
    return c.json({ data: stripAdminMeta(board, adminVisible(c)) }, 201)
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
    }
    throw e
  }
}

// PUT /boards/:boardId (name/description/category のみ更新)
export async function putBoardHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  try {
    const body = await c.req.json()
    const input = boardService.parseUpdateBoard(body)
    const board = await boardService.putBoard(
      c.get('db'), boardId, input,
      c.get('userId'), c.get('userRoleIds'), c.get('isSysAdmin'),
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

// PATCH /boards/:boardId (upsert: 権限・設定全般更新)
export async function patchBoardHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  try {
    const body = await c.req.json()
    const input = boardService.parseBoardBody(body)
    const board = await boardService.patchBoard(
      c.get('db'), boardId, input,
      c.get('userId'), c.get('userRoleIds'), c.get('isSysAdmin'),
      c.req.header('X-Session-Id') ?? null,
      c.req.header('X-Turnstile-Session') ?? null,
    )
    return c.json({ data: stripAdminMeta(board, adminVisible(c)) })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error) {
      if (e.message === 'FORBIDDEN') return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
      if (e.message === 'BOARD_NOT_FOUND') return c.json({ error: 'BOARD_NOT_FOUND', message: 'Board not found' }, 404)
    }
    throw e
  }
}

// DELETE /boards/:boardId
export async function deleteBoardHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  try {
    const deleted = await boardService.deleteBoard(
      c.get('db'), boardId,
      c.get('userId'), c.get('userRoleIds'), c.get('isSysAdmin'),
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
