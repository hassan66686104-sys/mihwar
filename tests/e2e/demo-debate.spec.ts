// الجلسة التجريبية (موسومة بوضوح) + المناظرة بين فريقين بمراحل يديرها المعلم، مع لقطات شاشة للتوثيق.
import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import pg from 'pg'

const env = Object.fromEntries(
  readFileSync('.env.e2e', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const SHOTS = process.env.SHOTS_DIR ?? 'test-results/screens'
mkdirSync(SHOTS, { recursive: true })

test('الجلسة التجريبية موسومة، والمناظرة تقيّد الإرسال بالفريق صاحب المرحلة', async ({ browser }) => {
  const db = new pg.Client({ connectionString: env.E2E_DB_URL })
  await db.connect()
  const t = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage()
  await t.goto('/teacher/login')
  await t.getByRole('button', { name: 'إنشاء حساب جديد' }).click()
  await t.getByLabel('البريد الإلكتروني').fill(`demo${Date.now()}@example.com`)
  await t.getByLabel('كلمة المرور').fill('Strong-Pass-123')
  await t.getByRole('button', { name: 'إنشاء الحساب' }).click()
  await t.getByLabel('الاسم الظاهر').fill('أ. معلم التجربة')
  await t.getByRole('button', { name: 'حفظ والمتابعة' }).click()
  await t.getByRole('button', { name: 'تجربة جلسة نموذجية' }).click()
  await t.waitForURL(/\/teacher\/s\//)
  await expect(t.getByText(/بيانات تجريبية: الأسماء والمشاركات وهمية/)).toBeVisible()
  await t.screenshot({ path: `${SHOTS}/teacher-control.png` })
  const sessionId = t.url().split('/').pop()!
  const { join_code } = (await db.query('select join_code from mh_sessions where id = $1', [sessionId])).rows[0]

  // الحديث في الجلسة التجريبية بلا درجة مختلقة
  const grade = (await db.query("select hadith_grade from mh_evidence e join mh_posts p on p.id = e.post_id where p.session_id = $1 and e.source_type = 'hadith'", [sessionId])).rows[0].hadith_grade
  expect(grade).toBe('')

  // طالب حقيقي ينضم من قائمة الصف التجريبي باسم «إبراهيم يوسف» (ليس من الثمانية الوهميين الحاضرين)
  const code = (await db.query("select s.access_code from mh_students s join mh_sessions x on x.class_id = s.class_id where x.id = $1 and s.full_name = 'إبراهيم يوسف'", [sessionId])).rows[0].access_code
  const st = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
  await st.goto(`/join/${join_code}`)
  await expect(st.getByText(/بيانات تجريبية/).first()).toBeVisible()
  await st.getByPlaceholder('ابحث عن اسمك…').fill('إبراهيم')
  await st.getByRole('radio', { name: 'إبراهيم يوسف' }).check()
  await st.getByLabel('رمزك الشخصي (من المعلم)').fill(code)
  await st.getByRole('button', { name: 'دخول غرفة النقاش' }).click()
  await st.waitForURL(/\/room\//)
  await expect(st.getByText('التوكل اعتماد القلب على الله').first()).toBeVisible()
  await st.screenshot({ path: `${SHOTS}/student-mobile.png`, fullPage: false })

  // المناظرة: الطالب في الفريق الثاني، والمرحلة الأولى للفريق الأول
  await t.getByRole('button', { name: 'الفرق والمناظرة' }).click()
  await t.getByRole('combobox', { name: 'فريق إبراهيم يوسف' }).selectOption({ label: 'الفريق الثاني' })
  await t.getByRole('button', { name: 'التحكم' }).click()
  await t.getByRole('button', { name: /المناظرة بين الفرق/ }).first().click()
  await t.getByRole('button', { name: 'الفرق والمناظرة' }).click()
  await t.getByRole('button', { name: 'بدء المرحلة الأولى' }).click()
  await expect(st.getByText('الحجة الأولى').first()).toBeVisible({ timeout: 4000 })

  const cred = JSON.parse((await st.evaluate((k) => localStorage.getItem(k), `mihwar:member:${sessionId}`))!)
  const send = async () =>
    fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/mh_submit_post`, {
      method: 'POST',
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_token: cred.token, p_client_id: crypto.randomUUID(), p_kind: 'opinion', p_body: 'حجة', p_parent: null, p_topic: null, p_evidence: null }),
    }).then(async (r) => ({ status: r.status, body: await r.text() }))
  const blocked = await send()
  expect(blocked.status).toBeGreaterThanOrEqual(400)
  expect(blocked.body).toContain('MH_NOT_YOUR_STAGE')

  await t.getByRole('button', { name: 'فتح المرحلة التالية' }).click()
  await expect(st.getByText('الرد على الحجة').first()).toBeVisible({ timeout: 4000 })
  expect((await send()).status).toBe(200)

  const present = await t.context().newPage()
  await present.goto(`/teacher/s/${sessionId}/present`)
  await expect(present.getByText('كيف يجمع المسلم بين التوكل على الله والأخذ بالأسباب في حياته اليومية؟')).toBeVisible()
  await present.screenshot({ path: `${SHOTS}/present.png` })

  await t.goto(`/teacher/s/${sessionId}/report`)
  await expect(t.getByRole('heading', { name: /تقرير الجلسة/ })).toBeVisible()
  await t.screenshot({ path: `${SHOTS}/report.png`, fullPage: true })
  await db.end()
})
