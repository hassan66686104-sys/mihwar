import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Alert, Badge, ConfirmButton, EmptyState, Modal, PageLoader, useAction, useToast } from '../../components/ui'
import { teacherApi } from '../../lib/api'
import { toAppError } from '../../lib/api/errors'
import type { TeacherHome } from '../../lib/api/types'
import { MODE_LABELS, STATUS_LABELS, STATUS_STYLES, fmtDate } from '../../lib/labels'

export default function Dashboard() {
  const nav = useNavigate()
  const [home, setHome] = useState<TeacherHome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [classOpen, setClassOpen] = useState(false)
  const [className, setClassName] = useState('')
  const [purgeDays, setPurgeDays] = useState(180)
  const { busy, run } = useAction()
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      setHome(await teacherApi.home())
      setError(null)
    } catch (e) {
      setError(toAppError(e).message)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  if (!home) return error ? <Alert tone="error">{error}</Alert> : <PageLoader />

  const active = home.sessions.filter((s) => s.status === 'open' || s.status === 'paused')
  const drafts = home.sessions.filter((s) => s.status === 'draft')
  const closed = home.sessions.filter((s) => s.status === 'closed')
  const demo = home.sessions.find((s) => s.is_demo)

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-olive-800">لوحة تحكم المعلم</h1>
          <p className="text-muted">أهلًا {home.profile.display_name}. من هنا تدير صفوفك وجلسات النقاش وتقاريرها.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/teacher/new" className="btn-primary">
            + إنشاء جلسة
          </Link>
          <button
            className="btn-gold"
            disabled={busy === 'demo'}
            onClick={async () => {
              const r = await run('demo', () => teacherApi.seedDemo(), 'أُنشئت الجلسة التجريبية')
              if (r) nav(`/teacher/s/${r.session_id}`)
            }}
          >
            {busy === 'demo' ? 'جارٍ الإنشاء…' : demo ? 'إعادة إنشاء الجلسة التجريبية' : 'تجربة جلسة نموذجية'}
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-4" aria-label="إحصاءات">
        {[
          ['كل الجلسات', home.sessions.length],
          ['الجلسات النشطة', active.length],
          ['الجلسات المكتملة', closed.length],
          ['الصفوف', home.classes.length],
        ].map(([label, n]) => (
          <div key={label} className="card p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="text-3xl font-extrabold text-olive-800 tabular-nums">{n}</p>
          </div>
        ))}
      </section>

      <SessionList title="الجلسات النشطة" list={active} empty="لا توجد جلسة مفتوحة الآن." />
      {drafts.length > 0 && <SessionList title="مسودات" list={drafts} empty="" />}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-olive-800">الصفوف وقوائم الطلاب</h2>
          <button className="btn-ghost btn-sm" onClick={() => setClassOpen(true)}>
            + صف جديد
          </button>
        </div>
        {home.classes.length === 0 ? (
          <EmptyState title="لم تضف صفًا بعد">أضف صفًا وقائمة طلابه ليحصل كل طالب على رمز دخول شخصي — وهي الطريقة المفضلة لضبط الهوية.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {home.classes.map((c) => (
              <Link key={c.id} to={`/teacher/classes/${c.id}`} className="card block p-4 hover:border-olive-300">
                <p className="font-bold text-olive-800">{c.name}</p>
                <p className="text-sm text-muted">{c.student_count} طالبًا</p>
                {c.is_demo && <Badge className="mt-2 bg-gold-100 text-gold-700">بيانات تجريبية</Badge>}
              </Link>
            ))}
          </div>
        )}
      </section>

      <SessionList title="الجلسات المكتملة والتقارير" list={closed} empty="لا توجد جلسات مكتملة بعد." showReport />

      <section className="card p-4">
        <h2 className="mb-2 font-bold text-olive-800">سياسة الاحتفاظ بالبيانات</h2>
        <p className="mb-3 text-sm text-muted">
          احذف نهائيًا الجلسات المغلقة الأقدم من مدة تحددها، مع كل مشاركاتها وأصواتها وتقييماتها. صدّر التقارير التي تحتاجها قبل الحذف.{' '}
          <Link to="/privacy" className="underline">
            تفاصيل الخصوصية
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor="pd">
            الجلسات المغلقة الأقدم من
          </label>
          <input id="pd" type="number" min={1} max={3650} className="input w-24" value={purgeDays} onChange={(e) => setPurgeDays(Number(e.target.value))} />
          <span className="text-sm">يومًا</span>
          <ConfirmButton
            confirmText={`سيُحذف نهائيًا كل ما يخص الجلسات المغلقة منذ أكثر من ${purgeDays} يومًا. لا يمكن التراجع.`}
            onConfirm={async () => {
              const n = await run('purge', () => teacherApi.purgeClosed(purgeDays))
              if (n !== undefined) {
                await load()
                toast('success', `حُذفت ${n} جلسة.`)
              }
            }}
          >
            حذف
          </ConfirmButton>
        </div>
      </section>

      <Modal open={classOpen} onClose={() => setClassOpen(false)} title="صف جديد">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const id = await run('class', () => teacherApi.saveClass(null, className.trim()))
            if (id) nav(`/teacher/classes/${id}`)
          }}
          className="space-y-3"
        >
          <label className="label" htmlFor="cn">
            اسم الصف أو المجموعة
          </label>
          <input id="cn" className="input" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="مثال: الثاني عشر — شعبة 3" required maxLength={80} />
          <button className="btn-primary" disabled={busy === 'class' || !className.trim()}>
            إنشاء
          </button>
        </form>
      </Modal>
    </div>
  )
}

function SessionList({ title, list, empty, showReport }: { title: string; list: TeacherHome['sessions']; empty: string; showReport?: boolean }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-olive-800">{title}</h2>
      {list.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((s) => (
            <div key={s.id} className="card flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={STATUS_STYLES[s.status]}>{STATUS_LABELS[s.status]}</Badge>
                <Badge className="bg-cream-200 text-olive-800">{MODE_LABELS[s.mode]}</Badge>
                {s.is_demo && <Badge className="bg-gold-100 text-gold-700">تجريبية</Badge>}
                <span className="ms-auto text-xs text-muted">{fmtDate(s.opened_at ?? s.created_at)}</span>
              </div>
              <p className="font-bold text-olive-900">{s.title}</p>
              <p className="text-sm text-muted">
                {s.class_name ?? 'بلا صف'} · {s.member_count} مشاركًا · {s.post_count} مشاركة · الرمز <span dir="ltr" className="font-bold">{s.join_code}</span>
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Link to={`/teacher/s/${s.id}`} className="btn-primary btn-sm">
                  إدارة الجلسة
                </Link>
                {(showReport || s.has_report) && (
                  <Link to={`/teacher/s/${s.id}/report`} className="btn-ghost btn-sm">
                    التقرير
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
