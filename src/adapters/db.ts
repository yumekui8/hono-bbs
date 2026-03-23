// DBアダプター: Cloudflare D1 / MySQL / PostgreSQL を同一インターフェースで扱う
// Node.js 向け実装は src/adapters/db.node.ts を参照

export type DbQueryResult<T> = { results: T[] }
export type DbRunResult = { changes: number }

// データベース操作の共通インターフェース
// D1 (Cloudflare Workers), MySQL, PostgreSQL すべてに同一 API を提供する
export interface DbAdapter {
  // 単一行を返す (存在しない場合は null)
  first<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>
  // 複数行を返す
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>>
  // 書き込み操作 (INSERT / UPDATE / DELETE)
  run(sql: string, params?: unknown[]): Promise<DbRunResult>
  // 複数クエリをトランザクション相当で一括実行
  batch(queries: Array<{ sql: string; params?: unknown[] }>): Promise<void>
}

// Cloudflare D1 を DbAdapter にラップする
export function createD1Adapter(d1: D1Database): DbAdapter {
  return {
    first(sql, params = []) {
      return d1.prepare(sql).bind(...params).first()
    },
    all(sql, params = []) {
      return d1.prepare(sql).bind(...params).all()
    },
    async run(sql, params = []) {
      const result = await d1.prepare(sql).bind(...params).run()
      return { changes: result.meta.changes ?? 0 }
    },
    async batch(queries) {
      await d1.batch(queries.map(q => d1.prepare(q.sql).bind(...(q.params ?? []))))
    },
  }
}
