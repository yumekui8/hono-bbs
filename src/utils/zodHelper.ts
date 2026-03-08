import { ZodError } from 'zod'

// esbuild bundling 環境では ZodError の class field 初期化順の問題で
// .errors getter (= this.issues) が undefined になる場合がある。
// .issues を直接参照し、optional chaining でフォールバックすることで回避する。

export function isZodError(e: unknown): e is ZodError {
  return e instanceof ZodError || (e instanceof Error && 'issues' in e)
}

export function zodMessage(e: unknown): string {
  const issues = (e as { issues?: Array<{ message?: string }> }).issues
  return issues?.[0]?.message
    ?? (e instanceof Error ? e.message : null)
    ?? 'Validation failed'
}
