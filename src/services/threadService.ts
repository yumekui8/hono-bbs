import { z } from 'zod'
import type { Thread } from '../types'
import * as threadRepository from '../repository/threadRepository'
import * as boardRepository from '../repository/boardRepository'

const createThreadSchema = z.object({
  title: z.string().min(1).max(200),
})

export type CreateThreadInput = z.infer<typeof createThreadSchema>

export function parseCreateThread(data: unknown): CreateThreadInput {
  return createThreadSchema.parse(data)
}

export async function getThreadsByBoardId(db: D1Database, boardId: string): Promise<Thread[]> {
  return threadRepository.findThreadsByBoardId(db, boardId)
}

export async function createThread(
  db: D1Database,
  boardId: string,
  input: CreateThreadInput,
): Promise<Thread> {
  // 掲示板存在チェック
  const board = await boardRepository.findBoardById(db, boardId)
  if (!board) {
    throw new Error('BOARD_NOT_FOUND')
  }

  const thread: Thread = {
    id: crypto.randomUUID(),
    boardId,
    title: input.title,
    createdAt: new Date().toISOString(),
  }
  await threadRepository.insertThread(db, thread)
  return thread
}

export async function deleteThread(
  db: D1Database,
  boardId: string,
  threadId: string,
): Promise<boolean> {
  // スレッドが指定した掲示板に属するか確認
  const thread = await threadRepository.findThreadById(db, threadId)
  if (!thread || thread.boardId !== boardId) {
    return false
  }
  return threadRepository.deleteThread(db, threadId)
}
