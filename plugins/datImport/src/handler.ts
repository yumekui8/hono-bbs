import type { Context } from 'hono'
import type { Env, DatPost } from './types'
import { decodeDat, parseDat } from './parser'
import { verifyPassword } from './password'

// D1 のバインドパラメータ上限は 100/ステートメント
// posts テーブルのカラム数 (10) × CHUNK_SIZE ≤ 100 になるよう設定
const POST_INSERT_CHUNK_SIZE = 9  // 9行 × 10カラム = 90パラメータ/ステートメント

export async function datImportHandler(c: Context<Env>): Promise<Response> {
  const boardId = c.req.query('board')
  if (!boardId) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'board query parameter is required' }, 400)
  }

  // multipart/form-data のみ受け付ける
  const ct = c.req.header('content-type') ?? ''
  if (!ct.includes('multipart/form-data')) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Content-Type must be multipart/form-data' }, 400)
  }

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Failed to parse form data' }, 400)
  }

  const adminId       = formData.get('id')
  const adminPassword = formData.get('password')
  const datEntry      = formData.get('dat')

  if (typeof adminId !== 'string' || typeof adminPassword !== 'string') {
    return c.json({ error: 'VALIDATION_ERROR', message: 'id and password are required' }, 400)
  }
  if (!datEntry) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'dat field (file) is required' }, 400)
  }

  // 管理者認証
  const user = await c.env.BBS_DB
    .prepare('SELECT password_hash, is_active FROM users WHERE id = ?')
    .bind(adminId)
    .first<{ password_hash: string; is_active: number }>()

  if (!user || !user.is_active) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Invalid credentials' }, 401)
  }

  const passwordOk = await verifyPassword(adminPassword, user.password_hash)
  if (!passwordOk) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Invalid credentials' }, 401)
  }

  // 管理者グループ所属チェック
  const bbsAdminGroup = c.env.BBS_ADMIN_GROUP ?? 'bbs-admin-group'
  const membership = await c.env.BBS_DB
    .prepare('SELECT 1 FROM user_groups WHERE user_id = ? AND group_id = ?')
    .bind(adminId, bbsAdminGroup)
    .first()

  if (!membership) {
    return c.json({ error: 'FORBIDDEN', message: 'BBS admin privileges required' }, 403)
  }

  // 板の存在確認
  const board = await c.env.BBS_DB
    .prepare('SELECT id, default_poster_name, default_thread_permissions FROM boards WHERE id = ?')
    .bind(boardId)
    .first<{ id: string; default_poster_name: string; default_thread_permissions: string }>()

  if (!board) {
    return c.json({ error: 'NOT_FOUND', message: `Board '${boardId}' not found` }, 404)
  }

  // dat ファイルのデコード (Shift-JIS → UTF-8)
  let datText: string
  if (datEntry instanceof File) {
    const buffer = await datEntry.arrayBuffer()
    datText = decodeDat(buffer)
  } else {
    // フォームテキストとして送られた場合 (UTF-8 済み)
    datText = String(datEntry)
  }

  const posts = parseDat(datText)
  if (posts.length === 0) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'dat file is empty or invalid' }, 400)
  }

  // スレッドと投稿を挿入 (1バッチでアトミックに)
  const { threadId, postCount } = await insertDatPosts(c.env.BBS_DB, board, boardId, posts, adminId)

  return c.json({
    data: {
      threadId,
      boardId,
      postCount,
      message: `Imported ${postCount} posts into thread '${threadId}'`,
    },
  }, 201)
}

async function insertDatPosts(
  db: D1Database,
  board: { default_poster_name: string; default_thread_permissions: string },
  boardId: string,
  posts: DatPost[],
  importedBy: string,
): Promise<{ threadId: string; postCount: number }> {
  const threadId = crypto.randomUUID()
  const now = new Date().toISOString()
  const firstPost = posts[0]
  const threadTitle     = firstPost.threadTitle || 'インポートスレッド'
  const threadCreatedAt = firstPost.dateStr || now

  // スレッドを先に挿入
  await db.prepare(
    'INSERT INTO threads (id, board_id, permissions, title, post_count, created_at, updated_at, creator_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    threadId,
    boardId,
    board.default_thread_permissions,
    threadTitle,
    posts.length,
    threadCreatedAt,
    now,
    importedBy,
  ).run()

  // 投稿を 9 行ずつ multi-row INSERT で挿入 (D1 上限: 100パラメータ/ステートメント)
  // 各 .run() は独立したオペレーション。失敗時はスレッドごと削除してロールバック
  try {
    for (let i = 0; i < posts.length; i += POST_INSERT_CHUNK_SIZE) {
      const chunk = posts.slice(i, i + POST_INSERT_CHUNK_SIZE)
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
      const values: (string | number)[] = []

      for (const [j, post] of chunk.entries()) {
        values.push(
          crypto.randomUUID(),
          threadId,
          i + j + 1,
          '10,10,10,8',
          post.displayUserId,
          post.posterName || board.default_poster_name,
          post.posterSubInfo,
          post.content,
          post.dateStr || now,
          importedBy,
        )
      }

      await db.prepare(
        `INSERT INTO posts (id, thread_id, post_number, permissions, display_user_id, poster_name, poster_sub_info, content, created_at, creator_user_id) VALUES ${placeholders}`,
      ).bind(...values).run()
    }
  } catch (err) {
    // 投稿挿入失敗時はスレッドを削除 (ON DELETE CASCADE で挿入済み投稿も削除される)
    await db.prepare('DELETE FROM threads WHERE id = ?').bind(threadId).run().catch(() => {})
    throw err
  }

  return { threadId, postCount: posts.length }
}
