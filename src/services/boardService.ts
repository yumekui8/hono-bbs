import { z } from 'zod'
import type { Board } from '../types'
import * as boardRepository from '../repository/boardRepository'

const createBoardSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

export type CreateBoardInput = z.infer<typeof createBoardSchema>

export function parseCreateBoard(data: unknown): CreateBoardInput {
  return createBoardSchema.parse(data)
}

export async function getBoards(db: D1Database): Promise<Board[]> {
  return boardRepository.findBoards(db)
}

export async function createBoard(db: D1Database, input: CreateBoardInput): Promise<Board> {
  const board: Board = {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description ?? null,
    createdAt: new Date().toISOString(),
  }
  await boardRepository.insertBoard(db, board)
  return board
}

export async function deleteBoard(db: D1Database, id: string): Promise<boolean> {
  return boardRepository.deleteBoard(db, id)
}
