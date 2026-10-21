// اختبارات قاعدة البيانات: تُشغَّل على PostgreSQL محلي بعد تطبيق migrations الفعلية
// مع محاكاة أدوار Supabase (anon / authenticated) ودالة auth.uid().
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Db, anon, expectCode, resetDb } from './helpers'

const db = new Db()
type Who = { role: 'authenticated'; uid: string }

let teacher: Who
let other: Who
let classId: string
let students: { id: string; full_name: string; access_code: string }[]

async function newSession(extra: Record<string, unknown> = {}) {
  const r = await db.rpc(teacher, 'mh_session_create', [
    JSON.stringify({ title: 'جلسة اختبار', lesson: 'درس', class_id: classId, main_question: 'ما رأيك؟', mode: 'forum', ...extra }),
  ])
  return r as { id: string; join_code: string }
}

async function join(code: string, idx: number) {
  const s = students[idx]
  const r = await db.rpc(anon, 'mh_join', [code, s.id, s.access_code, null])
  expect(r.ok).toBe(true)
  return r.token as string
}

function submit(token: string, body: string, opts: { kind?: string; parent?: string | null; clientId?: string; evidence?: object | null } = {}) {
  return db.rpc(anon, 'mh_submit_post', [
    token, opts.clientId ?? randomUUID(), opts.kind ?? 'opinion', body, opts.parent ?? null, null,
    opts.evidence ? JSON.stringify(opts.evidence) : null,
  ])
}

beforeAll(async () => {
  resetDb()
  teacher = await db.newTeacher('أ. خالد')
  other = await db.newTeacher('أ. آخر')
  classId = await db.rpc(teacher, 'mh_class_save', [null, 'الصف الثاني عشر'])
  const added = await db.rpc(teacher, 'mh_students_add', [classId, ['طالب أول', 'طالب ثان', 'طالب ثالث', 'طالب رابع']])
  expect(added).toBe(4)
  students = (await db.rpc(teacher, 'mh_class_detail', [classId])).students
})

afterAll(() => db.end())

describe('المعلم والجلسات', () => {
  it('ينشئ المعلم جلسة جديدة برمز دخول صالح', async () => {
    const s = await newSession({ topics: [{ title: 'محور أول' }] })
    expect(s.join_code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    const st = await db.rpc(teacher, 'mh_teacher_state', [s.id, 300])
    expect(st.session.title).toBe('جلسة اختبار')
    expect(st.topics).toHaveLength(1)
    expect(st.session.status).toBe('draft')
  })

  it('رموز الطلاب الشخصية عشوائية وغير مكررة', () => {
    const codes = new Set(students.map((s) => s.access_code))
    expect(codes.size).toBe(students.length)
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
  })

  it('يرفض الانتقال غير الصالح بين حالات الجلسة', async () => {
    const s = await newSession()
    await expectCode(db.rpc(teacher, 'mh_session_set_status', [s.id, 'paused']), 'MH_BAD_TRANSITION')
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'paused'])
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'closed'])
    const st = await db.rpc(teacher, 'mh_teacher_state', [s.id, 300])
    expect(st.session.status).toBe('closed')
    expect(st.audit.some((a: any) => a.action === 'status_change')).toBe(true)
  })

  it('لا يستطيع معلم آخر إدارة جلسة لا يملكها أو قراءتها', async () => {
    const s = await newSession()
    await expectCode(db.rpc(other, 'mh_teacher_state', [s.id, 300]), 'MH_FORBIDDEN')
    await expectCode(db.rpc(other, 'mh_session_set_status', [s.id, 'open']), 'MH_FORBIDDEN')
    await expectCode(db.rpc(other, 'mh_class_detail', [classId]), 'MH_FORBIDDEN')
    const rows = await db.as(other, 'select id from public.mh_sessions where id = $1', [s.id])
    expect(rows).toHaveLength(0) // RLS
    const own = await db.as(teacher, 'select id from public.mh_sessions where id = $1', [s.id])
    expect(own).toHaveLength(1)
  })
})

describe('دخول الطلاب والهوية', () => {
  it('يدخل الطالب المصرح له بالرمز ويُمنع انتحال هوية طالب آخر', async () => {
    const s = await newSession()
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const look = await db.rpc(anon, 'mh_lookup_session', [s.join_code.toLowerCase()])
    expect(look.roster).toHaveLength(4)
    expect(JSON.stringify(look)).not.toContain(students[0].access_code)
    // رمز الطالب الأول مع هوية الطالب الثاني = فشل
    const bad = await db.rpc(anon, 'mh_join', [s.join_code, students[1].id, students[0].access_code, null])
    expect(bad).toEqual({ ok: false, error: 'MH_BAD_CREDENTIALS' })
    const ok = await db.rpc(anon, 'mh_join', [s.join_code, students[0].id, students[0].access_code.toLowerCase(), null])
    expect(ok.ok).toBe(true)
    expect(ok.token).toHaveLength(64)
    const state = await db.rpc(anon, 'mh_student_state', [ok.token, 200])
    expect(state.me.display_name).toBe(students[0].full_name)
  })

  it('يحدد معدل المحاولات الفاشلة لكل طالب', async () => {
    const s = await newSession()
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    for (let i = 0; i < 5; i++) {
      const r = await db.rpc(anon, 'mh_join', [s.join_code, students[2].id, 'AAAAAAAA', null])
      expect(r.ok).toBe(false)
    }
    await expectCode(db.rpc(anon, 'mh_join', [s.join_code, students[2].id, students[2].access_code, null]), 'MH_RATE_LIMIT')
  })

  it('رمز جلسة خاطئ أو جلسة لم تبدأ أو مغلقة', async () => {
    await expectCode(db.rpc(anon, 'mh_lookup_session', ['ZZZZZZ']), 'MH_BAD_CODE')
    const s = await newSession()
    await expectCode(db.rpc(anon, 'mh_join', [s.join_code, students[0].id, students[0].access_code, null]), 'MH_SESSION_NOT_STARTED')
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'closed'])
    await expectCode(db.rpc(anon, 'mh_join', [s.join_code, students[0].id, students[0].access_code, null]), 'MH_SESSION_CLOSED')
  })

  it('وضع الاعتماد: الاسم المكتوب لا يكفي، ويحتاج اعتماد المعلم، ولا يتكرر الاسم', async () => {
    const s = await newSession({ settings: { join_mode: 'approval' } })
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const r = await db.rpc(anon, 'mh_join', [s.join_code, null, null, 'سالم'])
    expect(r.status).toBe('pending')
    await expectCode(submit(r.token, 'مرحبا'), 'MH_PENDING_APPROVAL')
    const dup = await db.rpc(anon, 'mh_join', [s.join_code, null, null, 'سالم'])
    expect(dup).toEqual({ ok: false, error: 'MH_NAME_TAKEN' })
    await db.rpc(teacher, 'mh_member_action', [r.member_id, 'approve', null])
    const p = await submit(r.token, 'مشاركة بعد الاعتماد')
    expect(p.status).toBe('approved')
  })

  it('إبطال رمز الطالب أو إخراجه يلغي وصوله فورًا', async () => {
    const s = await newSession()
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const tok = await join(s.join_code, 3)
    await db.rpc(teacher, 'mh_student_code', [students[3].id, 'regenerate'])
    await expectCode(db.rpc(anon, 'mh_student_state', [tok, 200]), 'MH_TOKEN_INVALID')
    students = (await db.rpc(teacher, 'mh_class_detail', [classId])).students
    const tok2 = await join(s.join_code, 3)
    const st = await db.rpc(teacher, 'mh_teacher_state', [s.id, 300])
    const mem = st.members.find((m: any) => m.student_id === students[3].id)
    await db.rpc(teacher, 'mh_member_action', [mem.id, 'revoke', null])
    await expectCode(db.rpc(anon, 'mh_student_state', [tok2, 200]), 'MH_TOKEN_INVALID')
    await expectCode(db.rpc(anon, 'mh_join', [s.join_code, students[3].id, students[3].access_code, null]), 'MH_REVOKED')
  })
})

describe('المشاركات', () => {
  it('تُحفظ المشاركة وتظهر لطالب آخر، ولا تتكرر بإعادة الإرسال', async () => {
    const s = await newSession()
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const a = await join(s.join_code, 0)
    const b = await join(s.join_code, 1)
    const cid = randomUUID()
    const r1 = await submit(a, 'التوكل مع الأخذ بالأسباب', { clientId: cid, kind: 'quran', evidence: { quote: 'نص', surah: 'الطلاق', ayah: '3' } })
    const r2 = await submit(a, 'التوكل مع الأخذ بالأسباب', { clientId: cid, kind: 'quran' })
    expect(r2.duplicate).toBe(true)
    expect(r2.id).toBe(r1.id)
    const seen = await db.rpc(anon, 'mh_student_state', [b, 200])
    expect(seen.posts).toHaveLength(1)
    expect(seen.posts[0].evidence.surah).toBe('الطلاق')
    expect(seen.posts[0].teacher_note).toBeUndefined()
    // الرد مرتبط بالمشاركة الأصلية
    await submit(b, 'أوافقك', { kind: 'rebuttal', parent: r1.id })
    const st = await db.rpc(teacher, 'mh_teacher_state', [s.id, 300])
    expect(st.posts.find((p: any) => p.parent_id === r1.id)).toBeTruthy()
    expect(st.posts.find((p: any) => p.id === r1.id).reply_count).toBe(1)
  })

  it('المراجعة المسبقة: المشاركة المعلقة والمرفوضة لا تظهر لبقية الطلاب', async () => {
    const s = await newSession({ settings: { moderation: true } })
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const a = await join(s.join_code, 0)
    const b = await join(s.join_code, 1)
    const p = await submit(a, 'مشاركة للمراجعة')
    expect(p.status).toBe('pending')
    expect((await db.rpc(anon, 'mh_student_state', [b, 200])).posts).toHaveLength(0)
    expect((await db.rpc(anon, 'mh_student_state', [a, 200])).posts[0].status).toBe('pending')
    await db.rpc(teacher, 'mh_post_moderate', [p.id, 'reject', null])
    expect((await db.rpc(anon, 'mh_student_state', [b, 200])).posts).toHaveLength(0)
    const p2 = await submit(a, 'مشاركة ثانية')
    await db.rpc(teacher, 'mh_post_moderate', [p2.id, 'approve', null])
    expect((await db.rpc(anon, 'mh_student_state', [b, 200])).posts).toHaveLength(1)
  })

  it('يمنع الإرسال بعد إغلاق الجلسة أو إيقافها أو إغلاق باب المشاركات أو انتهاء الوقت', async () => {
    const s = await newSession()
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const a = await join(s.join_code, 0)
    await db.rpc(teacher, 'mh_session_update', [s.id, JSON.stringify({ settings: { posts_open: false } })])
    await expectCode(submit(a, 'x'), 'MH_POSTS_CLOSED')
    expect((await submit(a, 'سؤال؟', { kind: 'question' })).status).toBe('approved')
    await db.rpc(teacher, 'mh_session_update', [s.id, JSON.stringify({ settings: { posts_open: true } })])
    await db.admin(`update public.mh_timers set ends_at = now() - interval '1 second' where session_id = $1 and scope = 'session'`, [s.id])
    await expectCode(submit(a, 'x'), 'MH_TIME_UP')
    await db.rpc(teacher, 'mh_timer_control', [s.id, 'session', 'add', 300])
    expect((await submit(a, 'بعد إضافة الوقت')).status).toBe('approved')
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'paused'])
    await expectCode(submit(a, 'x'), 'MH_SESSION_PAUSED')
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'closed'])
    await expectCode(submit(a, 'x'), 'MH_SESSION_CLOSED')
  })

  it('يطبق الحد الأقصى للمشاركات حتى مع الطلبات المتزامنة', async () => {
    const s = await newSession({ settings: { max_posts_per_student: 2 } })
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const a = await join(s.join_code, 0)
    const results = await Promise.allSettled([1, 2, 3, 4].map((i) => submit(a, `مشاركة ${i}`)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
    expect(results.filter((r) => r.status === 'rejected').every((r: any) => r.reason.message.includes('MH_LIMIT_REACHED'))).toBe(true)
  })

  it('مهلة التعديل يحددها المعلم', async () => {
    const s = await newSession({ settings: { edit_window_sec: 60 } })
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const a = await join(s.join_code, 0)
    const p = await submit(a, 'قبل التعديل')
    await db.rpc(anon, 'mh_edit_post', [a, p.id, 'بعد التعديل', null])
    await db.admin(`update public.mh_posts set created_at = now() - interval '2 minutes' where id = $1`, [p.id])
    await expectCode(db.rpc(anon, 'mh_edit_post', [a, p.id, 'متأخر', null]), 'MH_EDIT_EXPIRED')
  })
})

describe('الصلاحيات المباشرة', () => {
  it('الطالب (anon) لا يقرأ الجداول ولا يستدعي دوال المعلم أو الدوال الداخلية', async () => {
    const s = await newSession()
    await expectCode(db.as(anon, 'select * from public.mh_posts'), 'permission denied')
    await expectCode(db.as(anon, 'select * from public.mh_students'), 'permission denied')
    await expectCode(db.as(anon, `insert into public.mh_points(session_id, member_id, delta) values ($1, $1, 5)`, [s.id]), 'permission denied')
    await expectCode(db.rpc(anon, 'mh_timer_control', [s.id, 'session', 'start', 60]), 'permission denied')
    await expectCode(db.rpc(anon, 'mh_poll_set_status', [s.id, 'open']), 'permission denied')
    await expectCode(db.rpc(anon, 'mh_evaluate', [s.id, 'clarity', 4]), 'permission denied')
    await expectCode(db.rpc(anon, 'mh_timer_start', [s.id, 'session', 1000]), 'permission denied')
    await expectCode(db.rpc(anon, 'mh_teacher_state', [s.id, 10]), 'permission denied')
  })

  it('المعلم لا يكتب في الجداول مباشرة ولا يرى رموز الوصول المجزأة', async () => {
    const s = await newSession()
    await expectCode(db.as(teacher, `update public.mh_sessions set status = 'closed' where id = $1`, [s.id]), 'permission denied')
    await expectCode(db.as(teacher, 'select token_hash from public.mh_members'), 'permission denied')
  })

  it('رمز وصول طالب في جلسة لا يمنحه أي وصول لجلسة أخرى', async () => {
    const s1 = await newSession()
    const s2 = await newSession()
    await db.rpc(teacher, 'mh_session_set_status', [s1.id, 'open'])
    await db.rpc(teacher, 'mh_session_set_status', [s2.id, 'open'])
    const a = await join(s1.join_code, 0)
    const st = await db.rpc(anon, 'mh_student_state', [a, 200])
    expect(st.session.id).toBe(s1.id)
    const pollId = await db.rpc(teacher, 'mh_poll_create', [s2.id, JSON.stringify({ question: 'سؤال؟', kind: 'yesno' })])
    await db.rpc(teacher, 'mh_poll_set_status', [pollId, 'open'])
    const opt = (await db.admin('select id from public.mh_poll_options where poll_id = $1', [pollId]))[0].id
    await expectCode(db.rpc(anon, 'mh_vote', [a, pollId, [opt]], ['text', 'uuid', 'uuid[]']), 'MH_NOT_FOUND')
    await expectCode(db.rpc(anon, 'mh_student_state', ['0'.repeat(64), 200]), 'MH_TOKEN_INVALID')
  })
})

describe('التصويت', () => {
  it('صوت واحد لكل طالب، حتى مع طلبات متزامنة، والنتائج مخفية حتى الإغلاق', async () => {
    const s = await newSession()
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const a = await join(s.join_code, 0)
    const b = await join(s.join_code, 1)
    const pid = await db.rpc(teacher, 'mh_poll_create', [s.id, JSON.stringify({ question: 'هل توافق؟', kind: 'single', options: ['نعم', 'لا', 'لا أعرف'], hide_results: true })])
    const opts = (await db.admin('select id from public.mh_poll_options where poll_id = $1 order by position', [pid])).map((r) => r.id)
    await expectCode(db.rpc(anon, 'mh_vote', [a, pid, [opts[0]]], ['text', 'uuid', 'uuid[]']), 'MH_POLL_CLOSED')
    await db.rpc(teacher, 'mh_poll_set_status', [pid, 'open'])
    const res = await Promise.allSettled([
      db.rpc(anon, 'mh_vote', [a, pid, [opts[0]]], ['text', 'uuid', 'uuid[]']),
      db.rpc(anon, 'mh_vote', [a, pid, [opts[1]]], ['text', 'uuid', 'uuid[]']),
      db.rpc(anon, 'mh_vote', [a, pid, [opts[0]]], ['text', 'uuid', 'uuid[]']),
    ])
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    await expectCode(db.rpc(anon, 'mh_vote', [b, pid, [opts[0], opts[1]]], ['text', 'uuid', 'uuid[]']), 'MH_INVALID_INPUT')
    await db.rpc(anon, 'mh_vote', [b, pid, [opts[2]]], ['text', 'uuid', 'uuid[]'])
    let view = (await db.rpc(anon, 'mh_student_state', [b, 200])).polls[0]
    expect(view.results_visible).toBe(false)
    expect(view.options[0].count).toBeNull()
    expect(view.my_choice).toEqual([opts[2]])
    await db.rpc(teacher, 'mh_poll_set_status', [pid, 'closed'])
    await expectCode(db.rpc(anon, 'mh_vote', [b, pid, [opts[0]]], ['text', 'uuid', 'uuid[]']), 'MH_POLL_CLOSED')
    view = (await db.rpc(anon, 'mh_student_state', [b, 200])).polls[0]
    expect(view.ballots).toBe(2)
    expect(view.options.reduce((n: number, o: any) => n + Number(o.count), 0)).toBe(2)
    expect(Number(view.options[2].count)).toBe(1)
    await expectCode(db.rpc(teacher, 'mh_poll_set_status', [pid, 'open']), 'MH_BAD_TRANSITION')
  })
})

describe('قائمة طلب الحديث والمؤقت', () => {
  it('ترتيب مركزي، ولا تكرار، والإرسال للمتحدث فقط ضمن وقته', async () => {
    const s = await newSession({ mode: 'turns' })
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const a = await join(s.join_code, 0)
    const b = await join(s.join_code, 1)
    const ra = await db.rpc(anon, 'mh_request_speak', [a])
    const rb = await db.rpc(anon, 'mh_request_speak', [b])
    const ra2 = await db.rpc(anon, 'mh_request_speak', [a])
    expect(ra2.duplicate).toBe(true)
    expect(Number(rb.seq)).toBeGreaterThan(Number(ra.seq))
    const viewB = await db.rpc(anon, 'mh_student_state', [b, 200])
    expect(viewB.queue.map((q: any) => q.name)).toEqual([students[0].full_name, students[1].full_name])
    await expectCode(submit(a, 'قبل منح الدور'), 'MH_NOT_YOUR_TURN')
    await db.rpc(teacher, 'mh_queue_action', [s.id, 'next', null, 30])
    expect((await submit(a, 'مداخلتي')).status).toBe('approved')
    await expectCode(submit(b, 'ليس دوري'), 'MH_NOT_YOUR_TURN')
    const t = (await db.rpc(anon, 'mh_student_state', [b, 200])).timers.turn
    expect(t.status).toBe('running')
    expect(new Date(t.ends_at).getTime() - Date.now()).toBeGreaterThan(25000)
    await db.admin(`update public.mh_queue set ends_at = now() - interval '1 second' where session_id = $1 and status = 'speaking'`, [s.id])
    await expectCode(submit(a, 'بعد انتهاء الوقت'), 'MH_TIME_UP')
    await db.rpc(teacher, 'mh_session_update', [s.id, JSON.stringify({ settings: { turn_end_action: 'next' } })])
    await db.rpc(teacher, 'mh_queue_tick', [s.id])
    const after = await db.rpc(anon, 'mh_student_state', [b, 200])
    expect(after.queue.find((q: any) => q.status === 'speaking').name).toBe(students[1].full_name)
  })

  it('إيقاف الجلسة يجمّد المؤقت، والاستئناف يكمل من الوقت المتبقي', async () => {
    const s = await newSession({ duration_min: 10 })
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'paused'])
    let t = (await db.rpc(teacher, 'mh_teacher_state', [s.id, 1])).timers.session
    expect(t.status).toBe('paused')
    expect(Number(t.remaining_ms)).toBeGreaterThan(590000)
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    t = (await db.rpc(teacher, 'mh_teacher_state', [s.id, 1])).timers.session
    expect(t.status).toBe('running')
    expect(new Date(t.ends_at).getTime() - Date.now()).toBeGreaterThan(590000)
  })
})

describe('المناظرة', () => {
  it('المرحلة الحالية تحدد الفريق المسموح له وحده بالإرسال وعدد مشاركاته', async () => {
    const s = await newSession({ teams: ['فريق أ', 'فريق ب'] })
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const a = await join(s.join_code, 0)
    const b = await join(s.join_code, 1)
    let st = await db.rpc(teacher, 'mh_teacher_state', [s.id, 1])
    const [ta, tb] = st.teams
    const ma = st.members.find((m: any) => m.student_id === students[0].id)
    const mb = st.members.find((m: any) => m.student_id === students[1].id)
    await db.rpc(teacher, 'mh_team_assign', [ma.id, ta.id])
    await db.rpc(teacher, 'mh_team_assign', [mb.id, tb.id])
    await db.rpc(teacher, 'mh_session_set_mode', [s.id, 'debate'])
    await expectCode(submit(a, 'قبل فتح المرحلة'), 'MH_STAGE_NOT_OPEN')
    await db.rpc(teacher, 'mh_stage_activate', [s.id, null, true])
    st = await db.rpc(teacher, 'mh_teacher_state', [s.id, 1])
    expect(st.stages[0].team_id).toBe(ta.id)
    await expectCode(submit(b, 'ليست مرحلتنا'), 'MH_NOT_YOUR_STAGE')
    for (let i = 0; i < 3; i++) await submit(a, `حجة ${i}`)
    await expectCode(submit(a, 'حجة زائدة'), 'MH_LIMIT_REACHED')
    await db.rpc(teacher, 'mh_stage_activate', [s.id, null, true])
    expect((await submit(b, 'الرد')).status).toBe('approved')
    await expectCode(submit(a, 'ليس دورنا'), 'MH_NOT_YOUR_STAGE')
  })
})

describe('التقرير والتقييم والإبلاغ الفوري', () => {
  it('أرقام التقرير محسوبة من قاعدة البيانات، والطالب لا يقيّم نفسه', async () => {
    const s = await newSession({ settings: { points_enabled: true } })
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const a = await join(s.join_code, 0)
    await join(s.join_code, 1)
    const p = await submit(a, 'رأي مع دليل', { kind: 'hadith', evidence: { quote: 'نص', hadith_source: 'مصدر' } })
    await submit(a, 'ما الدليل؟', { kind: 'question' })
    await db.rpc(teacher, 'mh_post_moderate', [p.id, 'tag', 'good_evidence'])
    const st = await db.rpc(teacher, 'mh_teacher_state', [s.id, 1])
    const ma = st.members.find((m: any) => m.student_id === students[0].id)
    await db.rpc(teacher, 'mh_evaluate', [ma.id, 'clarity', 4])
    await expectCode(db.rpc(teacher, 'mh_evaluate', [ma.id, 'unknown', 4]), 'MH_INVALID_INPUT')
    await db.rpc(teacher, 'mh_points_add', [ma.id, 2, 'دليل مناسب', p.id])
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'closed'])
    const rep = (await db.rpc(teacher, 'mh_report_build', [s.id])).data
    expect(rep.is_final).toBe(true)
    expect(rep.counts.invited).toBe(4)
    expect(rep.counts.joined).toBe(2)
    expect(rep.counts.participated).toBe(1)
    expect(rep.counts.posts).toBe(2)
    expect(rep.counts.evidence).toBe(1)
    expect(rep.unanswered_questions).toHaveLength(1)
    expect(rep.low_participation).toEqual([students[1].full_name])
    const row = rep.students.find((x: any) => x.member_id === ma.id)
    expect(row).toMatchObject({ posts: 2, evidence: 1, points: 2, evaluations: { clarity: 4 } })
  })

  it('كل تغيير يرسل إشعار Broadcast بلا بيانات إلى قناة الجلسة', async () => {
    const s = await newSession()
    await db.admin('delete from realtime.sent')
    await db.rpc(teacher, 'mh_session_set_status', [s.id, 'open'])
    const a = await join(s.join_code, 0)
    await submit(a, 'نص سري لا يجب أن يظهر في الإشعار')
    const sent = await db.admin('select topic, payload, private from realtime.sent')
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every((r) => r.topic === `mh:${s.id}`)).toBe(true)
    expect(JSON.stringify(sent)).not.toContain('نص سري')
    expect(sent.map((r) => r.payload.t)).toContain('mh_posts')
  })

  it('البيانات التجريبية تُنشأ معلَّمة ومنفصلة، وإعادة إنشائها لا تكررها', async () => {
    const d1 = await db.rpc(teacher, 'mh_seed_demo')
    const d2 = await db.rpc(teacher, 'mh_seed_demo')
    expect(d2.session_id).not.toBe(d1.session_id)
    const home = await db.rpc(teacher, 'mh_teacher_home')
    expect(home.sessions.filter((x: any) => x.is_demo)).toHaveLength(1)
    const st = await db.rpc(teacher, 'mh_teacher_state', [d2.session_id, 300])
    expect(st.session.is_demo).toBe(true)
    expect(st.teams).toHaveLength(2)
    expect(st.polls).toHaveLength(2)
    expect(st.queue.filter((q: any) => q.status === 'waiting')).toHaveLength(2)
    const rep = (await db.rpc(teacher, 'mh_report_build', [d2.session_id])).data
    expect(rep.counts.posts).toBeGreaterThan(5)
  })
})
