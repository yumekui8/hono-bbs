import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getBoardsHandler,
  createBoardHandler,
  updateBoardHandler,
  deleteBoardHandler,
} from '../handlers/boardHandler'
import {
  getThreadsHandler,
  getThreadWithPostsHandler,
  createThreadHandler,
  updateThreadHandler,
  deleteThreadHandler,
} from '../handlers/threadHandler'
import {
  getPostHandler,
  createPostHandler,
  updatePostHandler,
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
boards.put('/:boardId', requireLogin, requireTurnstile, updateBoardHandler)
boards.delete('/:boardId', requireLogin, requireTurnstile, deleteBoardHandler)

// ── スレッド作成 (POST /boards/:boardId) ─────────────────
boards.post('/:boardId', requireTurnstile, createThreadHandler)

// ── スレッド詳細 + 投稿一覧 ──────────────────────────────
boards.get('/:boardId/:threadId', getThreadWithPostsHandler)
boards.put('/:boardId/:threadId', requireLogin, requireTurnstile, updateThreadHandler)
boards.delete('/:boardId/:threadId', requireLogin, requireTurnstile, deleteThreadHandler)

// ── 投稿 ─────────────────────────────────────────────────
boards.post('/:boardId/:threadId', requireTurnstile, createPostHandler)

// ── 特定投稿 (responseNumber = postNumber) ───────────────
boards.get('/:boardId/:threadId/:responseNumber', getPostHandler)
boards.put('/:boardId/:threadId/:responseNumber', requireTurnstile, updatePostHandler)
boards.delete('/:boardId/:threadId/:responseNumber', requireTurnstile, deletePostHandler)

export default boards
