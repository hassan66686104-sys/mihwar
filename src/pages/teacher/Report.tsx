// تقرير الجلسة: الأرقام محسوبة على الخادم من السجلات الفعلية (بيانات مؤكدة)،
// و«قراءة تلقائية» منفصلة مبنية على قواعد حسابية بسيطة وتحتاج مراجعة المعلم، ولا تُعد حكمًا على الطالب.
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Alert, DemoBanner, PageLoader, useToast } from '../../components/ui'
import { teacherApi } from '../../lib/api'
import { toAppError } from '../../lib/api/errors'
import type { PostKind, ReportData, ReportResult, TeacherTag } from '../../lib/api/types'
import { downloadCsv } from '../../lib/csv'
import { KIND_LABELS, MODE_LABELS, POLL_PHASE_LABELS, STATUS_LABELS, TAG_LABELS, fmtDate, fmtDateTime, fmtTime } from '../../lib/labels'

type Student = ReportData['students'][number]
const SCORE_LABELS: Record<number, string> = { 1: '1 — بداية', 2: '2 — يقترب', 3: '3 — متمكن', 4: '4 — متميز' }

export default function Report() {
  const { id = '' } = useParams()
  const toast = useToast()
  const [rep, setRep] = useState<ReportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState('')
  const [savingSummary, setSavingSummary] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await teacherApi.buildReport(id)
      setRep(r)
      setSummary(r.teacher_summary ?? '')
      setError(null)
    } catch (e) {
      setError(toAppError(e).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (!rep) return error ? <Alert tone="error">{error}</Alert> : <PageLoader label="جارٍ إعداد التقرير…" />
  const d = rep.data
  const s = d.session

  const patchStudent = (memberId: string, patch: Partial<Student>) =>
    setRep((r) => r && { ...r, data: { ...r.data, students: r.data.students.map((x) => (x.member_id === memberId ? { ...x, ...patch } : x)) } })

  const evaluate = async (st: Student, key: string, score: number | null) => {
    const prev = st.evaluations
    patchStudent(st.member_id, { evaluations: { ...prev, [key]: score } })
    try {
      await teacherApi.evaluate(st.member_id, key, score)
    } catch (e) {
      patchStudent(st.member_id, { evaluations: prev })
      toast('error', toAppError(e).message)
    }
  }

  const saveField = async (st: Student, field: 'note' | 'grade', value: string) => {
    if (value === st[field]) return
    try {
      await teacherApi.memberAction(st.member_id, field, value)
      patchStudent(st.member_id, { [field]: value })
      toast('success', 'حُفظ')
    } catch (e) {
      toast('error', toAppError(e).message)
    }
  }

  const exportCsv = () => {
    const rubric = d.rubric
    const rows: (string | number | null)[][] = [
      ['الجلسة', s.title],
      ['الدرس', s.lesson],
      ['الصف', s.class_name ?? ''],
      ['التاريخ', fmtDate(s.date)],
      ['بيانات تجريبية', s.is_demo ? 'نعم — أسماء وهمية' : 'لا'],
      [],
      ['الطالب', 'الحالة', 'الدور', 'الفريق', 'المشاركات', 'الردود', 'الأدلة', 'مرات الحديث', 'التصويتات', 'النقاط', 'مشاركات متميزة', ...rubric.map((r) => r.label), 'التقدير العام', 'ملاحظة المعلم'],
      ...d.students.map((st) => [
        st.name,
        st.status === 'active' ? 'نشط' : st.status === 'pending' ? 'بانتظار الاعتماد' : 'أُخرج',
        st.role_label ?? '',
        st.team ?? '',
        st.posts,
        st.replies,
        st.evidence,
        st.turns,
        st.votes,
        st.points,
        st.distinguished,
        ...rubric.map((r) => st.evaluations[r.key] ?? 'لم يُقيّم'),
        st.grade,
        st.note,
      ]),
      [],
      ['لم يدخلوا الجلسة', ...d.not_joined],
    ]
    downloadCsv(`mihwar-report-${s.date.slice(0, 10)}.csv`, rows)
  }

  const c = d.counts
  const stat = (label: string, value: number | string | null) => (
    <div className="rounded-xl bg-cream-100 p-3 text-center">
      <p className="text-2xl font-extrabold text-olive-800">{value ?? '—'}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link to={`/teacher/s/${id}`} className="text-sm text-muted hover:underline">
          ← إدارة الجلسة
        </Link>
        <span className="flex-1" />
        <button className="btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'جارٍ التحديث…' : 'تحديث الأرقام'}
        </button>
        <button className="btn-ghost btn-sm" onClick={exportCsv}>
          تصدير CSV
        </button>
        <button className="btn-primary btn-sm" onClick={() => window.print()}>
          طباعة / حفظ PDF
        </button>
      </div>
      {s.is_demo && <DemoBanner />}
      {!d.is_final && <Alert tone="warn">الجلسة لم تُغلق بعد؛ الأرقام تمثل اللحظة الحالية. يُحفظ التقرير النهائي تلقائيًا عند إغلاق الجلسة.</Alert>}

      <header className="card p-5">
        <h1 className="text-2xl font-extrabold text-olive-800">تقرير الجلسة: {s.title}</h1>
        <p className="mt-1 text-muted">
          {s.lesson} · {s.class_name ?? 'بلا صف'} · المعلم: {s.teacher_name} · {fmtDate(s.date)}
        </p>
        <p className="mt-1 text-sm text-muted">
          النمط: {MODE_LABELS[s.mode]} · الحالة: {STATUS_LABELS[s.status]} · البدء {fmtTime(s.opened_at)} · الإغلاق {fmtTime(s.closed_at)} · المدة المخططة {s.planned_minutes} د
          {s.actual_minutes !== null && ` · المدة الفعلية ${s.actual_minutes} د`}
        </p>
        {s.main_question && <p className="mt-3 rounded-xl bg-olive-50 p-3 font-bold text-olive-900">السؤال المحوري: {s.main_question}</p>}
        <p className="mt-2 text-xs text-muted">أُعدّ في {fmtDateTime(d.generated_at)}</p>
      </header>

      <section className="card p-5" aria-label="بيانات مؤكدة">
        <h2 className="mb-1 text-lg font-bold text-olive-800">بيانات مؤكدة</h2>
        <p className="mb-3 text-xs text-muted">أعداد محسوبة مباشرة من سجلات قاعدة البيانات.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {stat('المدعوون من الصف', c.invited)}
          {stat('دخلوا الجلسة', c.joined)}
          {stat('شاركوا بالكتابة', c.participated)}
          {stat('المشاركات', c.posts)}
          {stat('الردود', c.replies)}
          {stat('مشاركات بأدلة', c.evidence)}
          {stat('الأسئلة', c.questions)}
          {stat('مرفوضة', c.rejected)}
          {stat('لم تُراجع', c.pending)}
          {stat('أدوار حديث', c.turns)}
          {stat('طلبات حديث', c.hand_raises)}
          {stat('تصويتات', c.polls)}
          {stat('أصوات', c.ballots)}
        </div>
      </section>

      <section className="card p-5" aria-label="الطلاب">
        <h2 className="mb-1 text-lg font-bold text-olive-800">الطلاب والتقييم</h2>
        <p className="no-print mb-3 text-xs text-muted">
          التقييم يدوي من المعلم (1–4) ويُحفظ فور الاختيار. «لم يُقيّم» تعني أنك لم تضع درجة، وليست صفرًا. الملاحظة والتقدير يُحفظان عند مغادرة الحقل.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-muted">
              <tr className="border-b border-cream-300 text-start">
                <th className="py-2 text-start">الطالب</th>
                <th className="py-2" title="مشاركات / ردود / أدلة">نشاط</th>
                <th className="py-2">حديث</th>
                <th className="py-2">نقاط</th>
                {d.rubric.map((r) => (
                  <th key={r.key} className="py-2">
                    {r.label}
                  </th>
                ))}
                <th className="py-2">التقدير</th>
                <th className="py-2 text-start">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {d.students.map((st) => (
                <tr key={st.member_id} className="border-b border-cream-200 align-top">
                  <td className="py-2 pe-2">
                    <b>{st.name}</b>
                    <div className="text-xs text-muted">
                      {[st.team, st.role_label, st.status === 'revoked' ? 'أُخرج' : st.status === 'pending' ? 'بانتظار الاعتماد' : null].filter(Boolean).join(' · ')}
                      {st.distinguished > 0 && ` · متميزة: ${st.distinguished}`}
                    </div>
                  </td>
                  <td className="py-2 text-center">
                    {st.posts} / {st.replies} / {st.evidence}
                  </td>
                  <td className="py-2 text-center">{st.turns}</td>
                  <td className="py-2 text-center">{st.points}</td>
                  {d.rubric.map((r) => {
                    const v = st.evaluations[r.key] ?? null
                    return (
                      <td key={r.key} className="py-2 text-center">
                        <select
                          className="input no-print w-auto px-1 py-1 text-xs"
                          value={v ?? ''}
                          aria-label={`${r.label} — ${st.name}`}
                          onChange={(e) => void evaluate(st, r.key, e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">لم يُقيّم</option>
                          {[1, 2, 3, 4].map((n) => (
                            <option key={n} value={n}>
                              {SCORE_LABELS[n]}
                            </option>
                          ))}
                        </select>
                        <span className="hidden print:inline">{v ?? 'لم يُقيّم'}</span>
                      </td>
                    )
                  })}
                  <td className="py-2">
                    <input className="input no-print w-20 py-1" defaultValue={st.grade} maxLength={20} aria-label={`التقدير العام — ${st.name}`} onBlur={(e) => void saveField(st, 'grade', e.target.value.trim())} />
                    <span className="hidden print:inline">{st.grade}</span>
                  </td>
                  <td className="py-2">
                    <textarea className="input no-print min-w-48 py-1" rows={1} defaultValue={st.note} maxLength={500} aria-label={`ملاحظة — ${st.name}`} onBlur={(e) => void saveField(st, 'note', e.target.value.trim())} />
                    <span className="hidden print:inline">{st.note}</span>
                  </td>
                </tr>
              ))}
              {d.students.length === 0 && (
                <tr>
                  <td colSpan={6 + d.rubric.length} className="py-4 text-center text-muted">
                    لم يدخل أي طالب.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <ListCard title="لم يدخلوا الجلسة" items={d.not_joined} empty={s.class_name ? 'دخل الجميع.' : 'الجلسة غير مرتبطة بصف.'} />
        <ListCard title="دخلوا ولم يشاركوا بالكتابة أو الحديث" items={d.low_participation} empty="لا أحد." />
        <ListCard title="طلبوا الحديث ولم يحصلوا على الدور" items={d.waiting_never_granted} empty="لا أحد." />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-2 font-bold text-olive-800">أنواع المشاركات</h2>
          <ul className="space-y-1 text-sm">
            {(Object.entries(d.kinds) as [PostKind, number][]).map(([k, n]) => (
              <li key={k} className="flex justify-between">
                <span>{KIND_LABELS[k]}</span>
                <b>{n}</b>
              </li>
            ))}
            {Object.keys(d.kinds).length === 0 && <li className="text-muted">لا مشاركات.</li>}
          </ul>
          <h3 className="mt-4 mb-2 font-bold text-olive-800">تصنيفات المعلم</h3>
          <ul className="space-y-1 text-sm">
            {(Object.entries(d.tags) as [TeacherTag, number][]).map(([k, n]) => (
              <li key={k} className="flex justify-between">
                <span>{TAG_LABELS[k]}</span>
                <b>{n}</b>
              </li>
            ))}
            {Object.keys(d.tags).length === 0 && <li className="text-muted">لم تُصنَّف مشاركات.</li>}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="mb-2 font-bold text-olive-800">المحاور</h2>
          <ul className="space-y-1 text-sm">
            {d.topics.map((t, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{t.title}</span>
                <b>{t.posts}</b>
              </li>
            ))}
            {d.untopiced_posts > 0 && (
              <li className="flex justify-between text-muted">
                <span>بلا محور</span>
                <b>{d.untopiced_posts}</b>
              </li>
            )}
          </ul>
          {d.teams.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 font-bold text-olive-800">الفرق</h3>
              <ul className="space-y-1 text-sm">
                {d.teams.map((t, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{t.name}</span>
                    <span>
                      أعضاء {t.members} · مشاركات {t.posts}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {d.polls.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 font-bold text-olive-800">نتائج التصويت</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {d.polls.map((p, i) => (
              <div key={i} className="rounded-xl bg-cream-100 p-3">
                <p className="font-bold">{p.question}</p>
                <p className="mb-2 text-xs text-muted">
                  {POLL_PHASE_LABELS[p.phase]} · المصوّتون {p.ballots}
                </p>
                <ul className="space-y-1 text-sm">
                  {p.options.map((o, j) => {
                    const pct = p.ballots ? Math.round((o.count / p.ballots) * 100) : 0
                    return (
                      <li key={j}>
                        <div className="flex justify-between">
                          <span>{o.label}</span>
                          <span>
                            {o.count} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 rounded bg-cream-300">
                          <div className="h-2 rounded bg-olive-600" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
          <PrePost polls={d.polls} />
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <QuoteCard title="أفكار مميزة (مثبتة أو مصنفة «متميزة» أو «دليل مناسب»)" items={d.key_ideas.map((k) => ({ who: k.author, text: k.body, note: k.tag ? TAG_LABELS[k.tag] : k.pinned ? 'مثبتة' : '' }))} />
        <QuoteCard title="أكثر المشاركات نقاشًا" items={d.most_discussed.map((k) => ({ who: k.author, text: k.body, note: `${k.replies} رد` }))} />
        <QuoteCard title="أسئلة لم يُرد عليها" items={d.unanswered_questions.map((k) => ({ who: k.author, text: k.body, note: '' }))} />
        <QuoteCard title="خلاصات المعلم أثناء الجلسة" items={d.teacher_summaries.map((t) => ({ who: 'المعلم', text: t, note: '' }))} />
      </div>

      <section className="card border-gold-300 p-5" aria-label="قراءة تلقائية">
        <h2 className="mb-1 font-bold text-gold-700">قراءة تلقائية (تحتاج مراجعتك)</h2>
        <p className="mb-3 text-xs text-muted">ملاحظات مستخرجة بقواعد حسابية بسيطة من الأرقام أعلاه، وليست تحليلًا لمضمون المشاركات ولا حكمًا على الطلاب.</p>
        <ul className="list-inside list-disc space-y-1 text-sm">
          {insights(d).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </section>

      <section className="card p-5" aria-label="خلاصة المعلم">
        <h2 className="mb-2 font-bold text-olive-800">خلاصة المعلم وتوصياته</h2>
        <textarea className="input no-print" rows={5} maxLength={5000} value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="خلاصة المعلم" placeholder="ما تحقق من أهداف الدرس، وما يحتاج متابعة، وتوصيات للحصة القادمة…" />
        <p className="hidden whitespace-pre-wrap print:block">{summary || '—'}</p>
        <button
          className="btn-primary no-print mt-2"
          disabled={savingSummary || summary === rep.teacher_summary}
          onClick={async () => {
            setSavingSummary(true)
            try {
              await teacherApi.saveReportSummary(id, summary)
              setRep((r) => r && { ...r, teacher_summary: summary })
              toast('success', 'حُفظت الخلاصة')
            } catch (e) {
              toast('error', toAppError(e).message)
            } finally {
              setSavingSummary(false)
            }
          }}
        >
          {savingSummary ? 'جارٍ الحفظ…' : 'حفظ الخلاصة'}
        </button>
      </section>
    </div>
  )
}

function ListCard({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-bold text-olive-800">
        {title} ({items.length})
      </h2>
      {items.length ? <p className="text-sm">{items.join('، ')}</p> : <p className="text-sm text-muted">{empty}</p>}
    </section>
  )
}

function QuoteCard({ title, items }: { title: string; items: { who: string; text: string; note: string }[] }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-bold text-olive-800">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">لا يوجد.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((x, i) => (
            <li key={i} className="rounded-lg bg-cream-100 p-2">
              <b>{x.who}</b>
              {x.note && <span className="text-xs text-muted"> · {x.note}</span>}
              <p className="line-clamp-4 whitespace-pre-wrap">{x.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** مقارنة تصويت «قبل» و«بعد» إذا كان لهما نفس الخيارات */
function PrePost({ polls }: { polls: ReportData['polls'] }) {
  const pre = polls.find((p) => p.phase === 'pre')
  const post = polls.find((p) => p.phase === 'post')
  if (!pre || !post || !pre.ballots || !post.ballots) return null
  const same = pre.options.length === post.options.length && pre.options.every((o, i) => o.label === post.options[i].label)
  if (!same) return <p className="mt-3 text-xs text-muted">يوجد تصويت قبل النقاش وبعده بخيارات مختلفة، لذا لا تُعرض مقارنة مباشرة.</p>
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-bold text-olive-800">قبل النقاش ← بعده (نسبة المصوّتين)</h3>
      <ul className="space-y-1 text-sm">
        {pre.options.map((o, i) => {
          const a = Math.round((o.count / pre.ballots) * 100)
          const b = Math.round((post.options[i].count / post.ballots) * 100)
          return (
            <li key={i} className="flex justify-between">
              <span>{o.label}</span>
              <span>
                {a}% ← {b}% ({b - a >= 0 ? '+' : ''}
                {b - a})
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function insights(d: ReportData): string[] {
  const out: string[] = []
  const c = d.counts
  if (c.invited) out.push(`دخل ${c.joined} من ${c.invited} طالبًا مدعوًا (${Math.round((c.joined / c.invited) * 100)}%).`)
  if (c.joined) out.push(`شارك بالكتابة ${c.participated} من ${c.joined} ممن دخلوا.`)
  if (c.posts) {
    const pct = Math.round((c.evidence / c.posts) * 100)
    out.push(`${pct}% من المشاركات مرفقة بدليل${pct < 30 ? '؛ قد يفيد تذكير الطلاب بالاستدلال في الحصة القادمة' : ''}.`)
  }
  if (c.replies && c.posts) out.push(`نسبة الردود إلى المشاركات الرئيسية ${(c.replies / c.posts).toFixed(1)}، وهي مؤشر تقريبي على التفاعل بين الطلاب.`)
  if (d.unanswered_questions.length) out.push(`بقي ${d.unanswered_questions.length} سؤالًا بلا رد؛ يمكن البدء بها في الحصة القادمة.`)
  if (d.waiting_never_granted.length) out.push(`${d.waiting_never_granted.length} طالبًا طلبوا الحديث ولم يحصلوا على الدور.`)
  const needs = d.tags.needs_check ?? 0
  if (needs) out.push(`${needs} مشاركة صُنفت «تحتاج إلى تحقق» من مصدرها.`)
  const evaluated = d.students.filter((s) => Object.values(s.evaluations).some((v) => v !== null)).length
  out.push(`قُيّم ${evaluated} من ${d.students.length} طالبًا يدويًا على المعايير.`)
  return out
}
