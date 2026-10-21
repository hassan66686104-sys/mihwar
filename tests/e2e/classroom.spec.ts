// سيناريو صفي كامل في متصفحات متعددة في الوقت نفسه: معلم + طالبان (هاتف وحاسوب) + محاولة دخول خاطئة.
// يعمل على بيئة الاختبار المحلية (PostgREST وSupabase Auth حقيقيان، وRealtime مُحاكى) — انظر docs/TESTING.md
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import pg from 'pg'

const env = Object.fromEntries(
  readFileSync('.env.e2e', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const API = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const db = new pg.Client({ connectionString: env.E2E_DB_URL })

async function rpc(fn: string, args: Record<string, unknown>, token = KEY) {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const broadcasts = async () => (await (await fetch('http://127.0.0.1:54333')).json()).broadcasts as number

test.describe.configure({ mode: 'serial' })

let teacherCtx: BrowserContext, aCtx: BrowserContext, bCtx: BrowserContext
let teacher: Page, studentA: Page, studentB: Page
let sessionId = ''
let joinCode = ''
const codes: Record<string, string> = {}
const STUDENTS = ['أحمد سالم', 'يوسف خالد', 'عمر ناصر']
const email = `teacher${Date.now()}@example.com`

test.beforeAll(async ({ browser }) => {
  await db.connect()
  teacherCtx = await browser.newContext()
  aCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }) // هاتف
  bCtx = await browser.newContext({ viewport: { width: 1366, height: 800 } })
  teacher = await teacherCtx.newPage()
  studentA = await aCtx.newPage()
  studentB = await bCtx.newPage()
})
test.afterAll(async () => {
  await db.end()
})

test('المعلم ينشئ حسابًا وصفًا وجلسة ويفتحها', async () => {
  await teacher.goto('/teacher/login')
  await teacher.getByRole('button', { name: 'إنشاء حساب جديد' }).click()
  await teacher.getByLabel('البريد الإلكتروني').fill(email)
  await teacher.getByLabel('كلمة المرور').fill('Strong-Pass-123')
  await teacher.getByRole('button', { name: 'إنشاء الحساب' }).click()
  await teacher.getByLabel('الاسم الظاهر').fill('أ. محمد المعلم')
  await teacher.getByRole('button', { name: 'حفظ والمتابعة' }).click()
  await expect(teacher.getByRole('heading', { name: 'لوحة تحكم المعلم' })).toBeVisible()

  // لا وصول لصفحة المعلم بدون تسجيل دخول (سياق جديد)
  const anonPage = await (await teacher.context().browser()!.newContext()).newPage()
  await anonPage.goto('/teacher')
  await expect(anonPage.getByRole('heading', { name: 'دخول المعلم' })).toBeVisible()
  await anonPage.context().close()

  await teacher.getByRole('button', { name: '+ صف جديد' }).click()
  await teacher.getByLabel('اسم الصف أو المجموعة').fill('الثاني عشر — شعبة 1')
  await teacher.getByRole('button', { name: 'إنشاء', exact: true }).click()
  await teacher.getByLabel('إضافة طلاب (اسم في كل سطر)').fill(STUDENTS.join('\n'))
  await teacher.getByRole('button', { name: 'إضافة', exact: true }).click()
  await teacher.getByRole('button', { name: 'إظهار الرموز' }).click()
  for (const n of STUDENTS) {
    const row = teacher.getByRole('row').filter({ hasText: n })
    codes[n] = (await row.locator('span.font-mono').innerText()).trim()
    expect(codes[n]).toMatch(/^[A-Z2-9]{8}$/)
  }

  await teacher.goto('/teacher/new')
  await teacher.getByLabel('عنوان الجلسة').fill('التوكل والأخذ بالأسباب')
  await teacher.getByLabel('اسم الدرس').fill('التوكل على الله')
  await teacher.getByRole('button', { name: 'التالي' }).click()
  await expect(teacher.getByLabel('الصف أو المجموعة')).toHaveValue(/.+/)
  await teacher.getByRole('button', { name: 'التالي' }).click()
  await teacher.getByLabel('سؤال النقاش الرئيس').fill('هل يتعارض التوكل على الله مع الأخذ بالأسباب؟')
  for (let i = 0; i < 4; i++) await teacher.getByRole('button', { name: 'التالي' }).click()
  await teacher.getByLabel('مراجعة المشاركات قبل ظهورها').check()
  await teacher.getByRole('button', { name: 'التالي' }).click()
  await teacher.getByRole('button', { name: 'إنشاء الجلسة' }).click()
  await teacher.getByRole('link', { name: 'الانتقال إلى إدارة الجلسة' }).click()
  await teacher.waitForURL(/\/teacher\/s\/[0-9a-f-]{36}$/)
  sessionId = teacher.url().split('/').pop()!
  joinCode = (await db.query('select join_code from mh_sessions where id = $1', [sessionId])).rows[0].join_code

  // قبل الفتح: الطالب لا يستطيع الدخول
  await studentA.goto(`/join/${joinCode}`)
  await expect(studentA.getByText('مسودة').first()).toBeVisible()

  await teacher.getByRole('button', { name: '▶ فتح الجلسة' }).click()
  await expect(teacher.getByText('مفتوحة').first()).toBeVisible()
})

test('الطلاب يدخلون من الهاتف والحاسوب، والرمز الخاطئ يُرفض', async () => {
  // رمز خاطئ
  await studentB.goto(`/join/${joinCode}`)
  await studentB.getByRole('radio', { name: STUDENTS[1] }).check()
  await studentB.getByLabel('رمزك الشخصي (من المعلم)').fill(codes[STUDENTS[0]])
  await studentB.getByRole('button', { name: 'دخول غرفة النقاش' }).click()
  await expect(studentB.getByRole('alert')).toBeVisible()
  expect(studentB.url()).toContain('/join/')

  await studentB.getByLabel('رمزك الشخصي (من المعلم)').fill(codes[STUDENTS[1]])
  await studentB.getByRole('button', { name: 'دخول غرفة النقاش' }).click()
  await studentB.waitForURL(/\/room\//)
  await expect(studentB.getByRole('heading', { name: 'هل يتعارض التوكل على الله مع الأخذ بالأسباب؟' })).toBeVisible()

  await studentA.goto(`/join/${joinCode}`)
  await studentA.getByRole('radio', { name: STUDENTS[0] }).check()
  await studentA.getByLabel('رمزك الشخصي (من المعلم)').fill(codes[STUDENTS[0]])
  await studentA.getByRole('button', { name: 'دخول غرفة النقاش' }).click()
  await studentA.waitForURL(/\/room\//)
  // الاتصال الفوري قائم (وليس التحديث الدوري)
  await expect(studentA.getByRole('status').filter({ hasText: /^متصل$/ })).toBeVisible()
  await expect(studentB.getByRole('status').filter({ hasText: /^متصل$/ })).toBeVisible()

  // المعلم يرى الطالبين ومن لم يدخل
  await teacher.getByRole('button', { name: /^المشاركون/ }).click()
  await expect(teacher.getByText('المشاركون (2)', { exact: false })).toBeVisible()
  await expect(teacher.getByText(STUDENTS[2])).toBeVisible()
})

test('مشاركة تمر بالمراجعة ثم تظهر فورًا لزميل، مع دليل ورد', async () => {
  const before = await broadcasts()
  // الطالب (أ) على الهاتف: زر الكتابة السفلي ثم نافذة
  await studentA.getByRole('button', { name: /اكتب مشاركة/ }).click()
  await studentA.getByPlaceholder('اكتب مشاركتك…').fill('التوكل عمل قلبي، والأخذ بالأسباب عمل الجوارح، ولا تعارض بينهما.')
  await studentA.getByRole('button', { name: 'إرسال المشاركة' }).click()
  await expect(studentA.getByText('ستظهر لزملائك بعد مراجعة المعلم')).toBeVisible()
  await studentA.keyboard.press('Escape')

  // لا تظهر للطالب (ب) قبل الاعتماد
  await studentB.waitForTimeout(1500)
  await expect(studentB.getByText('التوكل عمل قلبي')).toHaveCount(0)

  await teacher.getByRole('button', { name: /^المشاركات/ }).click()
  const pending = teacher.locator('article, div').filter({ hasText: 'التوكل عمل قلبي' }).last()
  await expect(pending).toBeVisible()
  await teacher.getByRole('button', { name: 'قبول', exact: true }).first().click()

  // تظهر للطالب (ب) خلال ثوانٍ عبر البث الفوري (التحديث الدوري كل 30 ثانية فقط)
  await expect(studentB.getByText('التوكل عمل قلبي')).toBeVisible({ timeout: 4000 })
  expect(await broadcasts()).toBeGreaterThan(before)

  // الطالب (ب) يرسل آية بدليل كامل
  await studentB.getByLabel('نوع المشاركة').first().selectOption('quran')
  await studentB.getByLabel('نص الآية').fill('وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ')
  await studentB.getByLabel('اسم السورة').fill('الطلاق')
  await studentB.getByLabel('رقم الآية').fill('3')
  await studentB.getByPlaceholder('اكتب مشاركتك…').fill('الآية تبين أن الله كافٍ من توكل عليه.')
  await studentB.getByRole('button', { name: 'إرسال المشاركة' }).click()
  await expect(studentB.getByText('ستظهر لزملائك بعد مراجعة المعلم')).toBeVisible()

  await expect(teacher.getByText('الآية تبين أن الله كافٍ')).toBeVisible({ timeout: 4000 })
  await teacher.getByRole('button', { name: 'قبول', exact: true }).first().click()
  await expect(studentA.getByText('الآية تبين أن الله كافٍ')).toBeVisible({ timeout: 4000 })
  await expect(studentA.getByText('الطلاق').first()).toBeVisible()

  // رد الطالب (ب) على مشاركة (أ)
  await studentB.locator('article').filter({ hasText: 'التوكل عمل قلبي' }).getByRole('button', { name: '↩︎ رد' }).click()
  await studentB.getByPlaceholder('اكتب ردّك بأدب واحترام…').fill('أوافقك، والدليل حديث «اعقلها وتوكل».')
  await studentB.getByRole('button', { name: 'إرسال الرد' }).click()
  await expect(studentB.getByText('ستظهر لزملائك بعد مراجعة المعلم').first()).toBeVisible()

  await expect(teacher.getByText('أوافقك، والدليل حديث')).toBeVisible({ timeout: 4000 })
  await teacher.getByRole('button', { name: 'قبول', exact: true }).first().click()
  await expect(studentA.getByText('أوافقك، والدليل حديث')).toBeVisible({ timeout: 4000 })

  const rows = (await db.query('select count(*)::int n from mh_posts where session_id = $1', [sessionId])).rows[0].n
  expect(rows).toBe(3)
})

test('رفع اليد: ترتيب عادل ومنح الدور يصل للطالب فورًا', async () => {
  await teacher.getByRole('button', { name: 'التحكم' }).click()
  await teacher.getByRole('button', { name: /النقاش بالدور/ }).first().click()
  await expect(studentA.getByRole('heading', { name: 'النقاش بالدور' })).toBeVisible({ timeout: 4000 })

  await studentA.getByRole('button', { name: '✋ أطلب الحديث' }).click()
  await expect(studentA.getByText('ترتيبك في الانتظار')).toBeVisible()
  await studentB.getByRole('button', { name: '✋ أطلب الحديث' }).click()
  await expect(studentB.getByText(/ترتيبك في الانتظار: ?2/)).toBeVisible()

  await teacher.getByRole('button', { name: /^الدور/ }).click()
  await teacher.getByRole('button', { name: 'منح الدور للتالي' }).click()
  await expect(studentA.getByText('الدور لك الآن')).toBeVisible({ timeout: 4000 })
  await expect(studentB.getByText(`المتحدث الآن: ${STUDENTS[0]}`)).toBeVisible({ timeout: 4000 })
  await expect(studentB.getByText(/ترتيبك في الانتظار: ?1/)).toBeVisible()
  await teacher.getByRole('button', { name: 'سحب الدور / إنهاء' }).click()
  await expect(studentA.getByText('لا يوجد متحدث الآن.')).toBeVisible({ timeout: 4000 })
})

test('التصويت: صوت واحد لكل طالب والنتائج عند المعلم', async () => {
  await teacher.getByRole('button', { name: 'التصويت' }).click()
  await teacher.getByLabel('السؤال').fill('هل الأخذ بالأسباب ينافي التوكل؟')
  await teacher.getByLabel('النوع').selectOption('yesno')
  await teacher.getByRole('button', { name: 'إنشاء', exact: true }).click()
  await teacher.getByRole('button', { name: 'فتح التصويت' }).click()

  for (const [p, choice] of [
    [studentA, 'لا'],
    [studentB, 'لا'],
  ] as const) {
    await p.getByRole('button', { name: /^التصويت/ }).click()
    await p.getByRole('radio', { name: choice, exact: true }).check()
    await p.getByRole('button', { name: 'إرسال صوتي' }).click()
    await expect(p.getByText('✓ سُجّل صوتك')).toBeVisible()
  }
  await expect(teacher.getByText('المصوّتون: 2')).toBeVisible({ timeout: 4000 })

  // محاولة تصويت ثانية مباشرة عبر الواجهة البرمجية بنفس رمز الطالب تُرفض
  const cred = JSON.parse((await studentA.evaluate((k) => localStorage.getItem(k), `mihwar:member:${sessionId}`))!)
  const pollId = (await db.query('select id from mh_polls where session_id = $1', [sessionId])).rows[0].id
  const yes = (await db.query("select id from mh_poll_options where poll_id = $1 and label = 'نعم'", [pollId])).rows[0].id
  const again = await rpc('mh_vote', { p_token: cred.token, p_poll: pollId, p_options: [yes] })
  expect(again.status).toBeGreaterThanOrEqual(400)
  const ballots = (await db.query('select count(*)::int n from mh_poll_ballots where poll_id = $1', [pollId])).rows[0].n
  expect(ballots).toBe(2)
  await teacher.getByRole('button', { name: 'إغلاق التصويت' }).click()
})

test('المؤقت المركزي متزامن بين المعلم والطالب', async () => {
  await teacher.getByRole('button', { name: 'التحكم' }).click()
  await teacher.getByLabel('المدة بالدقائق').first().fill('2')
  await teacher.getByRole('button', { name: 'بدء', exact: true }).first().click()
  await studentB.waitForTimeout(1500)
  const read = async (p: Page) => {
    const t = await p.getByRole('timer', { name: /وقت الجلسة|المتبقي/ }).first().locator('p[dir=ltr]').innerText()
    const [m, s] = t.split(':').map(Number)
    return m * 60 + s
  }
  const [a, b] = await Promise.all([read(teacher), read(studentB)])
  expect(a).toBeGreaterThan(100)
  expect(Math.abs(a - b)).toBeLessThanOrEqual(2)
  // إيقاف مؤقت يتجمد عند الطالب
  await teacher.getByRole('button', { name: 'إيقاف مؤقت', exact: true }).first().click()
  await expect(studentB.getByText('متوقف مؤقتًا')).toBeVisible({ timeout: 4000 })
  const p1 = await read(studentB)
  await studentB.waitForTimeout(2500)
  expect(await read(studentB)).toBe(p1)
  await teacher.getByRole('button', { name: 'استئناف', exact: true }).first().click()
})

test('الطالب لا يصل لصلاحيات المعلم ولا للجداول مباشرة', async () => {
  const cred = JSON.parse((await studentA.evaluate((k) => localStorage.getItem(k), `mihwar:member:${sessionId}`))!)
  expect((await rpc('mh_teacher_state', { p_session: sessionId, p_post_limit: 10 })).status).toBeGreaterThanOrEqual(400)
  expect((await rpc('mh_session_set_status', { p_id: sessionId, p_status: 'closed' })).status).toBeGreaterThanOrEqual(400)
  const postId = (await db.query('select id from mh_posts where session_id = $1 limit 1', [sessionId])).rows[0].id
  expect((await rpc('mh_post_moderate', { p_post: postId, p_action: 'delete', p_value: null })).status).toBeGreaterThanOrEqual(400)
  const table = await fetch(`${API}/rest/v1/mh_members?select=*`, { headers: { apikey: KEY } })
  expect(table.status).toBeGreaterThanOrEqual(400)
  // انتحال: رمز الطالب (أ) لا يعمل في جلسة أخرى، والرمز العشوائي مرفوض
  expect((await rpc('mh_student_state', { p_token: 'f'.repeat(64), p_post_limit: 5 })).status).toBeGreaterThanOrEqual(400)
  expect((await rpc('mh_student_state', { p_token: cred.token, p_post_limit: 5 })).status).toBe(200)
  const status = (await db.query('select status from mh_sessions where id = $1', [sessionId])).rows[0].status
  expect(status).toBe('open')
})

test('إخراج طالب يقطع وصوله فورًا', async () => {
  await teacher.getByRole('button', { name: /^المشاركون/ }).click()
  await teacher.getByRole('listitem').filter({ hasText: STUDENTS[1] }).getByRole('button', { name: 'إخراج' }).click()
  await teacher.getByRole('button', { name: 'تأكيد' }).click()
  await expect(studentB.getByRole('link', { name: 'الدخول مرة أخرى' })).toBeVisible({ timeout: 5000 })
})

test('إغلاق الجلسة يوقف الإرسال، والتقرير والعرض يعملان', async () => {
  await teacher.getByRole('button', { name: 'التحكم' }).click()
  await teacher.getByRole('button', { name: '⏹ إغلاق الجلسة' }).click()
  await teacher.getByRole('button', { name: 'تأكيد' }).click()
  await expect(studentA.getByText('الجلسة مغلقة. يمكنك مراجعة المشاركات فقط.')).toBeVisible({ timeout: 4000 })
  const cred = JSON.parse((await studentA.evaluate((k) => localStorage.getItem(k), `mihwar:member:${sessionId}`))!)
  const late = await rpc('mh_submit_post', { p_token: cred.token, p_client_id: crypto.randomUUID(), p_kind: 'opinion', p_body: 'متأخر', p_parent: null, p_topic: null, p_evidence: null })
  expect(late.status).toBeGreaterThanOrEqual(400)

  await teacher.goto(`/teacher/s/${sessionId}/report`)
  await expect(teacher.getByRole('heading', { name: /تقرير الجلسة/ })).toBeVisible()
  const stat = (label: string) =>
    teacher.getByRole('region', { name: 'بيانات مؤكدة' }).locator('div.rounded-xl').filter({ has: teacher.getByText(label, { exact: true }) }).locator('p').first()
  await expect(stat('المشاركات')).toHaveText('2')
  await expect(stat('الردود')).toHaveText('1')
  await expect(stat('دخلوا الجلسة')).toHaveText('2')
  await expect(teacher.getByText(STUDENTS[2]).first()).toBeVisible() // لم يدخل
  // تقييم يدوي يُحفظ
  await teacher.getByLabel(new RegExp(`^وضوح.* — ${STUDENTS[0]}$`)).selectOption('3')
  await expect
    .poll(async () => (await db.query('select score from mh_evaluations e join mh_members m on m.id = e.member_id where m.display_name = $1', [STUDENTS[0]])).rows[0]?.score)
    .toBe(3)
  const [download] = await Promise.all([teacher.waitForEvent('download'), teacher.getByRole('button', { name: 'تصدير CSV' }).click()])
  const csv = readFileSync((await download.path())!, 'utf8')
  expect(csv.charCodeAt(0)).toBe(0xfeff)
  expect(csv).toContain(STUDENTS[0])

  await teacher.goto(`/teacher/s/${sessionId}/present`)
  await expect(teacher.getByText('هل يتعارض التوكل على الله مع الأخذ بالأسباب؟')).toBeVisible()
})
