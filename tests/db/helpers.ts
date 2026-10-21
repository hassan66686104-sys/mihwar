import pg from 'pg'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export const DB_URL = process.env.MH_TEST_DB_URL ?? 'postgresql://postgres@localhost:54329/mihwar_test'

export function resetDb() {
  execFileSync('bash', ['scripts/db-local-reset.sh'], { stdio: 'pipe' })
}

export class Db {
  pool = new pg.Pool({ connectionString: DB_URL, max: 6 })

  /** ينفّذ استعلامًا بصلاحيات دور محدد كما يفعل PostgREST في Supabase */
  async as<T = any>(who: { role: 'anon' | 'authenticated'; uid?: string }, sql: string, params: unknown[] = []): Promise<T[]> {
    const c = await this.pool.connect()
    try {
      await c.query('begin')
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(who.uid ? { sub: who.uid, role: who.role } : { role: who.role })])
      await c.query(`set local role ${who.role}`)
      const r = await c.query(sql, params)
      await c.query('commit')
      return r.rows as T[]
    } catch (e) {
      await c.query('rollback')
      throw e
    } finally {
      c.release()
    }
  }

  /** استدعاء دالة RPC وإرجاع قيمتها */
  async rpc<T = any>(who: { role: 'anon' | 'authenticated'; uid?: string }, fn: string, args: unknown[] = [], casts: string[] = []): Promise<T> {
    const ph = args.map((_, i) => `$${i + 1}${casts[i] ? '::' + casts[i] : ''}`).join(', ')
    const rows = await this.as<{ r: T }>(who, `select public.${fn}(${ph}) as r`, args)
    return rows[0].r
  }

  async admin<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pool.query(sql, params)).rows as T[]
  }

  async newTeacher(name = 'أ. معلم'): Promise<{ role: 'authenticated'; uid: string }> {
    const uid = randomUUID()
    await this.admin('insert into auth.users(id, email) values ($1, $2)', [uid, `${uid}@test.local`])
    const who = { role: 'authenticated' as const, uid }
    await this.rpc(who, 'mh_teacher_bootstrap', [name])
    return who
  }

  end() {
    return this.pool.end()
  }
}

export const anon = { role: 'anon' as const }

export async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p
  } catch (e: any) {
    if (String(e.message).includes(code)) return
    throw new Error(`expected ${code} but got: ${e.message}`)
  }
  throw new Error(`expected ${code} but call succeeded`)
}
