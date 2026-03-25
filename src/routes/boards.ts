import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getBoardsHandler,
  createBoardHandler,
  putBoardHandler,
  patchBoardHandler,
  deleteBoardHandler,
} from '../handlers/boardHandler'
import {
  getThreadsHandler,
  getThreadWithPostsHandler,
  createThreadHandler,
  putThreadHandler,
  patchThreadHandler,
  deleteThreadHandler,
} from '../handlers/threadHandler'
import {
  getPostHandler,
  createPostHandler,
  putPostHandler,
  patchPostHandler,
  deletePostHandler,
} from '../handlers/postHandler'
import { requireLogin } from '../middleware/auth'
import { requireTurnstile } from '../middleware/turnstile'

const boards = new Hono<AppEnv>()

// ── 板 (boards) ─────────────────────────────────────────
boards.get('/', getBoardsHandler)
boards.post('/', requireLogin, requireTurnstile, createBoardHandler)

// ── 板詳細 + スレッド一覧 ────────────────────────────────
boards.get('/:boardId', getThreadsHandler)
boards.put('/:boardId', requireLogin, requireTurnstile, putBoardHandler)
boards.patch('/:boardId', requireLogin, requireTurnstile, patchBoardHandler)
boards.delete('/:boardId', requireLogin, requireTurnstile, deleteBoardHandler)

// ── スレッド作成 (POST /boards/:boardId) ─────────────────
boards.post('/:boardId', requireTurnstile, createThreadHandler)

// ── スレッド詳細 + 投稿一覧 ──────────────────────────────
boards.get('/:boardId/:threadId', getThreadWithPostsHandler)
boards.put('/:boardId/:threadId', requireLogin, requireTurnstile, putThreadHandler)
boards.patch('/:boardId/:threadId', requireLogin, requireTurnstile, patchThreadHandler)
boards.delete('/:boardId/:threadId', requireLogin, requireTurnstile, deleteThreadHandler)

// ── 投稿 ─────────────────────────────────────────────────
boards.post('/:boardId/:threadId', requireTurnstile, createPostHandler)

// ── 特定投稿 (responseNumber = postNumber) ───────────────
boards.get('/:boardId/:threadId/:responseNumber', getPostHandler)
boards.put('/:boardId/:threadId/:responseNumber', requireTurnstile, putPostHandler)
boards.patch('/:boardId/:threadId/:responseNumber', requireLogin, requireTurnstile, patchPostHandler)
boards.delete('/:boardId/:threadId/:responseNumber', requireTurnstile, deletePostHandler)

export default boards
