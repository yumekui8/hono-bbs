import type { Board } from '../types'

type BoardRow = {
  id: string
  name: string
  description: string | null
  created_at: string
}

function rowToBoard(row: BoardRow): Board {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  }
}

export async function findBoards(db: D1Database): Promise<Board[]> {
  const result = await db.prepare('SELECT * FROM boards ORDER BY created_at DESC').all<BoardRow>()
  return result.results.map(rowToBoard)
}

export async function findBoardById(db: D1Database, id: string): Promise<Board | null> {
  const row = await db.prepare('SELECT * FROM boards WHERE id = ?').bind(id).first<BoardRow>()
  return row ? rowToBoard(row) : null
}

export async function insertBoard(db: D1Database, board: Board): Promise<void> {
  await db
    .prepare('INSERT INTO boards (id, name, description, created_at) VALUES (?, ?, ?, ?)')
    .bind(board.id, board.name, board.description, board.createdAt)
    .run()
}

export async function deleteBoard(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM boards WHERE id = ?').bind(id).run()
  return result.meta.changes > 0
}
