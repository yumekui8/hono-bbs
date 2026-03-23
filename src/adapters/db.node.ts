// Node.js 向け DB アダプター実装
// MySQL (mysql2) / PostgreSQL (pg) をサポート
// 使用には npm install mysql2 または npm install pg が必要
//
// 環境変数:
//   DB_DRIVER=mysql | postgresql | sqlite
//   DATABASE_URL=mysql://user:pass@host:3306/dbname
//              =postgresql://user:pass@host:5432/dbname
//              =./local.db  (SQLite: better-sqlite3 使用)

import type { DbAdapter, DbRunResult } from './db'

// MySQL/PostgreSQL の ? プレースホルダーに関する注意:
//   MySQL: ? をそのまま使用 (D1/SQLite と互換)
//   PostgreSQL: ? を $1, $2, ... に変換する必要がある

// ? を $1, $2, ... に変換 (PostgreSQL 用)
function toPgSql(sql: string): string {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

// SQLite 方言を MySQL/PostgreSQL 互換に変換する共通ヘルパー
// 例: INSERT OR IGNORE → MySQL: INSERT IGNORE, PostgreSQL: INSERT ... ON CONFLICT DO NOTHING
function toMysqlSql(sql: string): string {
  return sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT IGNORE INTO')
}

function toPgSqlCompat(sql: string): string {
  // INSERT OR IGNORE INTO table (cols) VALUES (vals) → INSERT INTO table (cols) VALUES (vals) ON CONFLICT DO NOTHING
  // 先に OR IGNORE を変換してから ? → $N に変換する
  const noIgnore = sql.replace(
    /INSERT\s+OR\s+IGNORE\s+INTO(\s+\S+\s*\([^)]*\)\s*VALUES\s*\([^)]*\))/gi,
    'INSERT INTO$1 ON CONFLICT DO NOTHING',
  )
  return toPgSql(noIgnore)
}

// MySQL2 プール (mysql2/promise の Pool) を DbAdapter にラップする
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMysqlAdapter(pool: any): DbAdapter {
  return {
    async first<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      const [rows] = await pool.execute(toMysqlSql(sql), params)
      return ((rows as T[])[0] ?? null) as T | null
    },
    async all<T>(sql: string, params: unknown[] = []) {
      const [rows] = await pool.execute(toMysqlSql(sql), params)
      return { results: rows as T[] }
    },
    async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
      const [result] = await pool.execute(toMysqlSql(sql), params)
      return { changes: (result as { affectedRows: number }).affectedRows ?? 0 }
    },
    async batch(queries) {
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        for (const q of queries) {
          await conn.execute(toMysqlSql(q.sql), q.params ?? [])
        }
        await conn.commit()
      } catch (e) {
        await conn.rollback()
        throw e
      } finally {
        conn.release()
      }
    },
  }
}

// node-postgres (pg) の Pool を DbAdapter にラップする
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPostgresAdapter(pool: any): DbAdapter {
  return {
    async first<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      const res = await pool.query(toPgSqlCompat(sql), params)
      return (res.rows[0] as T) ?? null
    },
    async all<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(toPgSqlCompat(sql), params)
      return { results: res.rows as T[] }
    },
    async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
      const res = await pool.query(toPgSqlCompat(sql), params)
      return { changes: res.rowCount ?? 0 }
    },
    async batch(queries) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        for (const q of queries) {
          await client.query(toPgSqlCompat(q.sql), q.params ?? [])
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    },
  }
}

// better-sqlite3 の Database を DbAdapter にラップする (同期 → 非同期ラップ)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSqliteAdapter(db: any): DbAdapter {
  return {
    async first<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      return (db.prepare(sql).get(...params) as T) ?? null
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return { results: db.prepare(sql).all(...params) as T[] }
    },
    async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
      const result = db.prepare(sql).run(...params)
      return { changes: result.changes ?? 0 }
    },
    async batch(queries) {
      const tx = db.transaction(() => {
        for (const q of queries) {
          db.prepare(q.sql).run(...(q.params ?? []))
        }
      })
      tx()
    },
  }
}

// 環境変数から DB アダプターを生成するファクトリ関数
// DB_DRIVER: "mysql" | "postgresql" | "sqlite" (デフォルト: sqlite)
// DATABASE_URL: 接続文字列
export async function createDbAdapterFromEnv(): Promise<DbAdapter> {
  const driver = process.env.DB_DRIVER ?? 'sqlite'
  const url = process.env.DATABASE_URL ?? './local.db'

  if (driver === 'mysql') {
    const mysql = await import('mysql2/promise')
    const pool = mysql.createPool(url)
    return createMysqlAdapter(pool)
  }

  if (driver === 'postgresql') {
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: url })
    return createPostgresAdapter(pool)
  }

  // デフォルト: better-sqlite3 (sqlite)
  const Database = (await import('better-sqlite3')).default
  const db = new Database(url)
  return createSqliteAdapter(db)
}
