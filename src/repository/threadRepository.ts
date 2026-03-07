import type { Thread } from '../types'

type ThreadRow = {
  id: string
  board_id: string
  title: string
  created_at: string
}

function rowToThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    createdAt: row.created_at,
  }
}

export async function findThreadsByBoardId(db: D1Database, boardId: string): Promise<Thread[]> {
  const result = await db
    .prepare('SELECT * FROM threads WHERE board_id = ? ORDER BY created_at DESC')
    .bind(boardId)
    .all<ThreadRow>()
  return result.results.map(rowToThread)
}

export async function findThreadById(db: D1Database, id: string): Promise<Thread | null> {
  const row = await db.prepare('SELECT * FROM threads WHERE id = ?').bind(id).first<ThreadRow>()
  return row ? rowToThread(row) : null
}

export async function insertThread(db: D1Database, thread: Thread): Promise<void> {
  await db
    .prepare('INSERT INTO threads (id, board_id, title, created_at) VALUES (?, ?, ?, ?)')
    .bind(thread.id, thread.boardId, thread.title, thread.createdAt)
    .run()
}

export async function deleteThread(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM threads WHERE id = ?').bind(id).run()
  return result.meta.changes > 0
}
