// DB アダプター (plugins/twoCh 用コピー)
// 本体の src/adapters/db.ts と同一インターフェース

export type DbQueryResult<T> = { results: T[] }
export type DbRunResult = { changes: number }

export interface DbAdapter {
  first<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>>
  run(sql: string, params?: unknown[]): Promise<DbRunResult>
  batch(queries: Array<{ sql: string; params?: unknown[] }>): Promise<void>
}

export function createD1Adapter(d1: D1Database): DbAdapter {
  return {
    first(sql, params = []) { return d1.prepare(sql).bind(...params).first() },
    all(sql, params = [])   { return d1.prepare(sql).bind(...params).all() },
    async run(sql, params = []) {
      const result = await d1.prepare(sql).bind(...params).run()
      return { changes: result.meta.changes ?? 0 }
    },
    async batch(queries) {
      await d1.batch(queries.map(q => d1.prepare(q.sql).bind(...(q.params ?? []))))
    },
  }
}
