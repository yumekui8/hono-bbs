import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getBoardsHandler, createBoardHandler, updateBoardHandler, deleteBoardHandler } from '../handlers/boardHandler'
import { requireLogin, requireBbsAdminGroup } from '../middleware/auth'
import { requireTurnstile } from '../middleware/turnstile'

const boards = new Hono<AppEnv>()

boards.get('/', getBoardsHandler)
boards.post('/', requireLogin, requireBbsAdminGroup, requireTurnstile, createBoardHandler)
boards.put('/:boardId', requireLogin, requireTurnstile, updateBoardHandler)
boards.delete('/:boardId', requireLogin, requireTurnstile, deleteBoardHandler)

export default boards
