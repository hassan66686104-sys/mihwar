// بيئة اختبار شاملة محلية تشبه Supabase، لتشغيل اختبارات المتصفح (Playwright) دون إنترنت:
//   - PostgreSQL محلي + migrations المشروع نفسها
//   - PostgREST الحقيقي (نفس محرك /rest/v1 في Supabase)
//   - Supabase Auth الحقيقي (GoTrue) لتسجيل المعلمين
//   - بوابة صغيرة على المنفذ 54321 توجّه /rest/v1 و/auth/v1، وتحاكي قناة Realtime (بروتوكول Phoenix للبث فقط)
// ملاحظة صريحة: خادم Realtime هنا مُحاكى وليس خادم Supabase Realtime الحقيقي.
//
// المتطلبات: PostgreSQL يعمل، وملفا postgrest وauth (انظر README). المتغيرات:
//   PG_ADMIN_URL (افتراضي postgresql://postgres@127.0.0.1:54329/postgres)
//   STACK_BIN (افتراضي ~/.stack) — مجلد يحوي postgrest و auth/auth و auth/migrations
import { spawn, execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { WebSocketServer } from 'ws'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ADMIN = process.env.PG_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:54329/postgres'
const BIN = process.env.STACK_BIN ?? path.join(homedir(), '.stack')
const DB = 'mihwar_e2e'
const DB_URL = ADMIN.replace(/\/[^/]*$/, `/${DB}`)
const withUser = (u) => DB_URL.replace('postgres@', `${u}@`)
const SECRET = 'mihwar-e2e-only-secret-not-for-production-0123456789'
const PORT = 54321
const REST_PORT = 54331
const AUTH_PORT = 54332

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function jwt(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64(payload)
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`
}
const ANON_KEY = jwt({ role: 'anon', iss: 'mihwar-e2e', iat: 1700000000, exp: 2000000000 })

function psql(url, args) {
  execFileSync('psql', [url, '-q', '-v', 'ON_ERROR_STOP=1', ...args], { stdio: 'inherit', env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } })
}

// 1) قاعدة بيانات جديدة
psql(ADMIN, ['-c', `drop database if exists ${DB} with (force)`, '-c', `create database ${DB}`])
const setup = readFileSync(path.join(root, 'scripts/e2e-stack/db-setup.sql'), 'utf8').replace('current_database_placeholder', DB)
psql(DB_URL, ['-c', setup])

// 2) جداول Auth عبر أداة الترحيل في Supabase Auth نفسها
const authEnv = {
  ...process.env,
  GOTRUE_DB_DRIVER: 'postgres',
  DATABASE_URL: `${withUser('supabase_auth_admin')}?search_path=auth`,
  GOTRUE_DB_MIGRATIONS_PATH: path.join(BIN, 'auth/migrations'),
  GOTRUE_SITE_URL: 'http://localhost:5173',
  GOTRUE_URI_ALLOW_LIST: 'http://localhost:5173/**',
  API_EXTERNAL_URL: `http://127.0.0.1:${PORT}/auth/v1`,
  GOTRUE_API_HOST: '127.0.0.1',
  PORT: String(AUTH_PORT),
  GOTRUE_JWT_SECRET: SECRET,
  GOTRUE_JWT_EXP: '3600',
  GOTRUE_JWT_AUD: 'authenticated',
  GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
  GOTRUE_JWT_ADMIN_ROLES: 'service_role',
  GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
  GOTRUE_MAILER_AUTOCONFIRM: 'true',
  GOTRUE_DISABLE_SIGNUP: 'false',
  GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000',
  GOTRUE_RATE_LIMIT_TOKEN_REFRESH: '1000',
  GOTRUE_RATE_LIMIT_SIGN_UP_SIGN_IN: '10000',
  GOTRUE_LOG_LEVEL: 'warn',
}
execFileSync(path.join(BIN, 'auth/auth'), ['migrate'], { env: authEnv, stdio: 'inherit' })

// 3) migrations المشروع بالترتيب
for (const f of readdirSync(path.join(root, 'supabase/migrations')).filter((x) => x.endsWith('.sql')).sort()) {
  psql(DB_URL, ['-f', path.join(root, 'supabase/migrations', f)])
}

// 4) الخوادم
const children = []
const run = (cmd, args, env) => {
  const c = spawn(cmd, args, { env, stdio: ['ignore', 'inherit', 'inherit'] })
  children.push(c)
  c.on('exit', (code) => {
    console.error(`[stack] ${path.basename(cmd)} exited with ${code}`)
    shutdown(1)
  })
}
run(path.join(BIN, 'postgrest'), [], {
  ...process.env,
  PGRST_DB_URI: withUser('authenticator'),
  PGRST_DB_SCHEMAS: 'public',
  PGRST_DB_ANON_ROLE: 'anon',
  PGRST_JWT_SECRET: SECRET,
  PGRST_SERVER_PORT: String(REST_PORT),
  PGRST_SERVER_HOST: '127.0.0.1',
  PGRST_LOG_LEVEL: 'warn',
})
run(path.join(BIN, 'auth/auth'), ['serve'], authEnv)

// 5) البوابة: توجيه HTTP + محاكاة بث Realtime
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, prefer, accept-profile, content-profile, x-client-info, x-supabase-api-version, range',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'access-control-expose-headers': 'content-range, x-supabase-api-version',
}
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    return res.end()
  }
  const route = req.url.startsWith('/rest/v1') ? [REST_PORT, '/rest/v1'] : req.url.startsWith('/auth/v1') ? [AUTH_PORT, '/auth/v1'] : null
  if (!route) {
    res.writeHead(404, CORS)
    return res.end('not found')
  }
  // كما في Supabase: مفتاح apikey مطلوب، ويُمرَّر كتوكن إن لم يوجد توكن مستخدم
  const headers = { ...req.headers, host: '127.0.0.1' }
  if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`
  const up = http.request({ host: '127.0.0.1', port: route[0], path: req.url.slice(route[1].length) || '/', method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, { ...r.headers, ...CORS })
    r.pipe(res)
  })
  up.on('error', (e) => {
    res.writeHead(502, CORS)
    res.end(String(e))
  })
  req.pipe(up)
})

const wss = new WebSocketServer({ noServer: true })
const subs = new Map() // topic -> Set<ws>
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/realtime/v1/websocket')) return socket.destroy()
  wss.handleUpgrade(req, socket, head, (ws) => {
    const joined = new Set()
    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      const [joinRef, ref, topic, event] = msg
      const reply = (response = {}) => ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]))
      if (event === 'heartbeat') return reply()
      if (event === 'phx_join') {
        if (!subs.has(topic)) subs.set(topic, new Set())
        subs.get(topic).add(ws)
        joined.add(topic)
        return reply({ postgres_changes: [] })
      }
      if (event === 'phx_leave') {
        subs.get(topic)?.delete(ws)
        joined.delete(topic)
        return reply()
      }
      if (event === 'access_token') return
      return reply()
    })
    ws.on('close', () => joined.forEach((t) => subs.get(t)?.delete(ws)))
  })
})

const listener = new pg.Client({ connectionString: DB_URL })
await listener.connect()
await listener.query('listen mh_realtime')
let sentCount = 0
listener.on('notification', (n) => {
  const m = JSON.parse(n.payload)
  const topic = `realtime:${m.topic}`
  const frame = JSON.stringify([null, null, topic, 'broadcast', { type: 'broadcast', event: m.event, payload: m.payload }])
  subs.get(topic)?.forEach((ws) => {
    ws.send(frame)
    sentCount++
  })
})

server.listen(PORT, '127.0.0.1', async () => {
  // انتظار جاهزية PostgREST وAuth
  for (let i = 0; i < 60; i++) {
    const ok = await Promise.all([
      fetch(`http://127.0.0.1:${REST_PORT}/`).then((r) => r.status < 500).catch(() => false),
      fetch(`http://127.0.0.1:${AUTH_PORT}/health`).then((r) => r.ok).catch(() => false),
    ])
    if (ok.every(Boolean)) break
    await new Promise((r) => setTimeout(r, 500))
  }
  writeFileSync(path.join(root, '.env.e2e'), `VITE_SUPABASE_URL=http://127.0.0.1:${PORT}\nVITE_SUPABASE_ANON_KEY=${ANON_KEY}\nE2E_DB_URL=${DB_URL}\n`)
  console.log(`[stack] ready on http://127.0.0.1:${PORT} (db ${DB})`)
})

// نقطة فحص بسيطة لعدد رسائل البث المرسلة (تستخدمها الاختبارات)
http.createServer((_q, r) => r.end(JSON.stringify({ broadcasts: sentCount, sockets: [...subs.values()].reduce((n, s) => n + s.size, 0) }))).listen(54333, '127.0.0.1')

function shutdown(code = 0) {
  children.forEach((c) => c.kill('SIGTERM'))
  process.exit(code)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
