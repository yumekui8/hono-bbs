import type { Context } from 'hono'
import { ZodError } from 'zod'
import type { AppEnv } from '../types'
import * as boardService from '../services/boardService'

export async function getBoardsHandler(c: Context<AppEnv>): Promise<Response> {
  const boards = await boardService.getBoards(c.env.DB)
  return c.json({ data: boards })
}

export async function createBoardHandler(c: Context<AppEnv>): Promise<Response> {
  const body = await c.req.json()
  try {
    const input = boardService.parseCreateBoard(body)
    const board = await boardService.createBoard(c.env.DB, input)
    return c.json({ data: board }, 201)
  } catch (e) {
    if (e instanceof ZodError) {
      return c.json({ error: 'VALIDATION_ERROR', message: e.errors[0].message }, 400)
    }
    throw e
  }
}

export async function deleteBoardHandler(c: Context<AppEnv>): Promise<Response> {
  const boardId = c.req.param('boardId')
  const deleted = await boardService.deleteBoard(c.env.DB, boardId)
  if (!deleted) {
    return c.json({ error: 'BOARD_NOT_FOUND', message: 'Board not found' }, 404)
  }
  return new Response(null, { status: 204 })
}
