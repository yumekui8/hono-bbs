import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getBoardsHandler, createBoardHandler, deleteBoardHandler } from '../handlers/boardHandler'
import { adminAuth } from '../middleware/adminAuth'

const boards = new Hono<AppEnv>()

boards.get('/', getBoardsHandler)
boards.post('/', adminAuth, createBoardHandler)
boards.delete('/:boardId', adminAuth, deleteBoardHandler)

export default boards
