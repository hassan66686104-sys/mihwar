import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { JoinInfo } from '../../components/JoinInfo'
import { Alert, PageLoader, useAction } from '../../components/ui'
import { teacherApi, type SessionInput } from '../../lib/api'
import type { Mode, SessionSettings, TeacherHome } from '../../lib/api/types'
import { MODE_HINTS, MODE_LABELS } from '../../lib/labels'

const STEPS = ['الدرس', 'الصف', 'السؤال', 'المحاور', 'النمط', 'المدة', 'السياسات', 'المراجعة']

export default function NewSession() {
  const nav = useNavigate()
  const [home, setHome] = useState<TeacherHome | null>(null)
  const [step, setStep] = useState(0)
  const [created, setCreated] = useState<{ id: string; join_code: string } | null>(null)
  const { busy, run } = useAction()
  const [f, setF] = useState<SessionInput>({
    title: '',
    lesson: '',
    class_id: null,
    main_question: '',
    instructions: 'اكتب رأيك مدعّمًا بدليل أو شاهد إن وُجد، واذكر وجه الاستدلال. ردّ على زملائك بأدب، وناقش الفكرة لا الشخص.',
    mode: 'forum',
    duration_min: 40,
    settings: {},
    topics: [],
    teams: ['الفريق الأول', 'الفريق الثاني'],
  })
  const [settings, setSettings] = useState<Partial<SessionSettings>>({
    join_mode: 'roster',
    moderation: false,
    replies_enabled: true,
    evidence_enabled: true,
    points_enabled: false,
    show_points_to_students: false,
    max_posts_per_student: 0,
    max_replies_per_student: 0,
    edit_window_sec: 120,
    hand_raise_enabled: true,
    turn_seconds: 60,
    turn_end_action: 'lock',
    allow_join_closed: false,
  })

  useEffect(() => {
    void teacherApi.home().then((h) => {
      setHome(h)
      const first = h.classes.find((c) => !c.is_demo)
      if (first) setF((x) => ({ ...x, class_id: first.id }))
      else setSettings((s) => ({ ...s, join_mode: 'approval' }))
    })
  }, [])

  if (!home) return <PageLoader />

  if (created) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Alert tone="success">أُنشئت الجلسة «{f.title}» بنجاح، وهي الآن مسودة. افتحها من صفحة الإدارة عندما تكون جاهزًا ليتمكن الطلاب من الدخول.</Alert>
        <JoinInfo joinCode={created.join_code} />
        <div className="flex gap-2">
          <Link to={`/teacher/s/${created.id}`} className="btn-primary">
            الانتقال إلى إدارة الجلسة
          </Link>
        </div>
      </div>
    )
  }

  const set = <K extends keyof SessionInput>(k: K, v: SessionInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const setS = <K extends keyof SessionSettings>(k: K, v: SessionSettings[K]) => setSettings((x) => ({ ...x, [k]: v }))
  const valid = [
    f.title.trim().length >= 2,
    settings.join_mode === 'approval' || !!f.class_id,
    f.main_question.trim().length >= 3,
    true,
    f.mode !== 'debate' || f.teams.filter((t) => t.trim()).length >= 2,
    f.duration_min >= 1 && f.duration_min <= 300,
    true,
    true,
  ]

  const create = async () => {
    const r = await run('create', () =>
      teacherApi.createSession({
        ...f,
        settings,
        topics: f.topics.filter((t) => t.title.trim().length >= 2),
        teams: f.mode === 'debate' ? f.teams.filter((t) => t.trim()) : [],
      }),
    )
    if (r) setCreated(r)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-extrabold text-olive-800">جلسة نقاش جديدة</h1>
      <ol className="mb-6 flex flex-wrap gap-1 text-xs" aria-label="خطوات الإنشاء">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i <= step && setStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={`chip px-3 py-1 ${i === step ? 'bg-olive-700 text-cream-50' : i < step ? 'bg-olive-100 text-olive-800' : 'bg-cream-200 text-muted'}`}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="card space-y-4 p-5">
        {step === 0 && (
          <>
            <Field label="عنوان الجلسة" id="t">
              <input id="t" className="input" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={120} placeholder="مثال: التوكل على الله والأخذ بالأسباب" />
            </Field>
            <Field label="اسم الدرس" id="l">
              <input id="l" className="input" value={f.lesson} onChange={(e) => set('lesson', e.target.value)} maxLength={120} />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <fieldset className="space-y-2">
              <legend className="label">طريقة دخول الطلاب</legend>
              <Radio checked={settings.join_mode === 'roster'} onChange={() => setS('join_mode', 'roster')} disabled={home.classes.length === 0}>
                <strong>قائمة الصف + رمز شخصي لكل طالب</strong> (الطريقة المفضلة لضبط الهوية)
              </Radio>
              <Radio checked={settings.join_mode === 'approval'} onChange={() => setS('join_mode', 'approval')}>
                <strong>يكتب الطالب اسمه ويعتمده المعلم</strong> — أقل ضبطًا للهوية: الاسم المكتوب لا يثبت شيئًا، فراجع الأسماء قبل الاعتماد.
              </Radio>
            </fieldset>
            {settings.join_mode === 'roster' &&
              (home.classes.length === 0 ? (
                <Alert tone="warn">
                  لا توجد صفوف بعد. <Link to="/teacher" className="font-bold underline">أنشئ صفًا من لوحة التحكم</Link> أو اختر الطريقة الثانية.
                </Alert>
              ) : (
                <Field label="الصف أو المجموعة" id="c">
                  <select id="c" className="input" value={f.class_id ?? ''} onChange={(e) => set('class_id', e.target.value || null)}>
                    <option value="">— اختر —</option>
                    {home.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.student_count} طالبًا){c.is_demo ? ' — تجريبي' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
          </>
        )}

        {step === 2 && (
          <>
            <Field label="سؤال النقاش الرئيس" id="q">
              <textarea id="q" className="input" rows={3} value={f.main_question} onChange={(e) => set('main_question', e.target.value)} maxLength={500} />
            </Field>
            <Field label="تعليمات مختصرة للطلاب" id="i">
              <textarea id="i" className="input" rows={3} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} maxLength={1000} />
            </Field>
            <p className="text-xs text-muted">اختر قضايا مناسبة للنقاش مع احترام الثوابت الشرعية؛ لا تُعرض النصوص القطعية للتصويت أو المنافسة.</p>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-sm text-muted">المحاور اختيارية، ويختار الطالب المحور عند كتابة مشاركته. يمكنك تعديلها وتفعيلها لاحقًا.</p>
            {f.topics.map((t, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="input"
                  aria-label={`المحور ${i + 1}`}
                  value={t.title}
                  maxLength={200}
                  onChange={(e) => set('topics', f.topics.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                />
                <button type="button" className="btn-ghost btn-sm" onClick={() => set('topics', f.topics.filter((_, j) => j !== i))} aria-label="حذف المحور">
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="btn-ghost btn-sm" onClick={() => set('topics', [...f.topics, { title: '' }])}>
              + إضافة محور
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
                <label key={m} className={`cursor-pointer rounded-xl border p-4 ${f.mode === m ? 'border-olive-500 bg-olive-50' : 'border-cream-300'}`}>
                  <input type="radio" name="mode" className="sr-only" checked={f.mode === m} onChange={() => set('mode', m)} />
                  <span className="font-bold text-olive-800">{MODE_LABELS[m]}</span>
                  <span className="mt-1 block text-sm text-muted">{MODE_HINTS[m]}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">يمكنك تبديل النمط أثناء الجلسة من صفحة الإدارة.</p>
            {f.mode === 'debate' && (
              <div className="space-y-2">
                <p className="label">أسماء الفرق (يُوزَّع الطلاب عليها بعد دخولهم)</p>
                {f.teams.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input" value={t} maxLength={40} aria-label={`الفريق ${i + 1}`} onChange={(e) => set('teams', f.teams.map((x, j) => (j === i ? e.target.value : x)))} />
                    {f.teams.length > 2 && (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => set('teams', f.teams.filter((_, j) => j !== i))} aria-label="حذف الفريق">
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {f.teams.length < 6 && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => set('teams', [...f.teams, `الفريق ${f.teams.length + 1}`])}>
                    + فريق
                  </button>
                )}
                <p className="text-xs text-muted">تُنشأ مراحل افتراضية: الحجة الأولى ← الرد ← التعقيب ← التعقيب الأخير ← خلاصة المعلم، ويمكن تعديلها.</p>
              </div>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <Field label="مدة الجلسة بالدقائق" id="d">
              <input id="d" type="number" min={1} max={300} className="input w-32" value={f.duration_min} onChange={(e) => set('duration_min', Number(e.target.value))} />
            </Field>
            <Check checked={settings.auto_start_timer ?? true} onChange={(v) => setS('auto_start_timer', v)}>
              تشغيل مؤقت الجلسة تلقائيًا عند فتحها
            </Check>
            <Field label="وقت كل مداخلة في النقاش بالدور (ثانية)" id="ts">
              <select id="ts" className="input w-40" value={settings.turn_seconds} onChange={(e) => setS('turn_seconds', Number(e.target.value))}>
                {[30, 45, 60, 90, 120, 180].map((n) => (
                  <option key={n} value={n}>
                    {n} ثانية
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        {step === 6 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="label">المشاركة</legend>
              <Check checked={!!settings.moderation} onChange={(v) => setS('moderation', v)}>
                مراجعة المشاركات قبل ظهورها
              </Check>
              <Check checked={!!settings.replies_enabled} onChange={(v) => setS('replies_enabled', v)}>
                السماح بالردود على المشاركات
              </Check>
              <Check checked={settings.reply_scope === 'team'} onChange={(v) => setS('reply_scope', v ? 'team' : 'all')}>
                الرد على أعضاء الفريق نفسه فقط
              </Check>
              <NumberField label="الحد الأقصى للمشاركات لكل طالب (0 = بلا حد)" value={settings.max_posts_per_student ?? 0} onChange={(n) => setS('max_posts_per_student', n)} max={100} />
              <NumberField label="الحد الأقصى للردود لكل طالب (0 = بلا حد)" value={settings.max_replies_per_student ?? 0} onChange={(n) => setS('max_replies_per_student', n)} max={100} />
              <Field label="مهلة تعديل المشاركة" id="ew">
                <select id="ew" className="input" value={settings.edit_window_sec} onChange={(e) => setS('edit_window_sec', Number(e.target.value))}>
                  <option value={0}>لا يُسمح بالتعديل</option>
                  <option value={60}>دقيقة واحدة</option>
                  <option value={120}>دقيقتان</option>
                  <option value={300}>5 دقائق</option>
                </select>
              </Field>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="label">الأدلة والتصويت والنقاط</legend>
              <Check checked={!!settings.evidence_enabled} onChange={(v) => setS('evidence_enabled', v)}>
                السماح بإرفاق الأدلة والشواهد
              </Check>
              <Check checked={!!settings.hand_raise_enabled} onChange={(v) => setS('hand_raise_enabled', v)}>
                السماح بطلب الحديث (رفع اليد)
              </Check>
              <Check checked={settings.turn_end_action === 'next'} onChange={(v) => setS('turn_end_action', v ? 'next' : 'lock')}>
                عند انتهاء وقت المداخلة: انقل الدور تلقائيًا للتالي
              </Check>
              <Check checked={!!settings.points_enabled} onChange={(v) => setS('points_enabled', v)}>
                تفعيل نظام النقاط
              </Check>
              <Check checked={!!settings.show_points_to_students} onChange={(v) => setS('show_points_to_students', v)} disabled={!settings.points_enabled}>
                إظهار نقاط كل طالب له
              </Check>
              <Check checked={!!settings.allow_join_closed} onChange={(v) => setS('allow_join_closed', v)}>
                السماح بالدخول للاطلاع بعد إغلاق الجلسة
              </Check>
              <p className="text-xs text-muted">تُنشأ التصويتات من صفحة إدارة الجلسة، مع خيارات إظهار الأسماء وإخفاء النتائج.</p>
            </fieldset>
          </div>
        )}

        {step === 7 && (
          <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold text-muted">العنوان</dt>
            <dd>{f.title}</dd>
            <dt className="font-semibold text-muted">الدرس</dt>
            <dd>{f.lesson || '—'}</dd>
            <dt className="font-semibold text-muted">الدخول</dt>
            <dd>{settings.join_mode === 'roster' ? `قائمة الصف: ${home.classes.find((c) => c.id === f.class_id)?.name ?? '—'}` : 'اسم + اعتماد المعلم'}</dd>
            <dt className="font-semibold text-muted">السؤال</dt>
            <dd>{f.main_question}</dd>
            <dt className="font-semibold text-muted">المحاور</dt>
            <dd>{f.topics.filter((t) => t.title.trim()).map((t) => t.title).join('، ') || '—'}</dd>
            <dt className="font-semibold text-muted">النمط</dt>
            <dd>{MODE_LABELS[f.mode]}</dd>
            <dt className="font-semibold text-muted">المدة</dt>
            <dd>{f.duration_min} دقيقة</dd>
            <dt className="font-semibold text-muted">المراجعة المسبقة</dt>
            <dd>{settings.moderation ? 'مفعّلة' : 'غير مفعّلة'}</dd>
          </dl>
        )}

        <div className="flex flex-wrap gap-2 border-t border-cream-200 pt-4">
          {step > 0 && (
            <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}>
              السابق
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" disabled={!valid[step]} onClick={() => setStep(step + 1)}>
              التالي
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={busy === 'create' || !valid.every(Boolean)} onClick={create}>
              {busy === 'create' ? 'جارٍ الإنشاء…' : 'إنشاء الجلسة'}
            </button>
          )}
          <button type="button" className="btn-ghost ms-auto" onClick={() => nav('/teacher')}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex min-h-10 cursor-pointer items-start gap-2 ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" className="mt-1.5 h-5 w-5 shrink-0 accent-olive-700" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

function Radio({ checked, onChange, children, disabled }: { checked: boolean; onChange: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${checked ? 'border-olive-500 bg-olive-50' : 'border-cream-300'} ${disabled ? 'opacity-50' : ''}`}>
      <input type="radio" className="mt-1.5 h-5 w-5 accent-olive-700" checked={checked} onChange={onChange} disabled={disabled} />
      <span>{children}</span>
    </label>
  )
}

export function NumberField({ label, value, onChange, max }: { label: string; value: number; onChange: (n: number) => void; max: number }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type="number" min={0} max={max} className="input w-28" value={value} onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} />
    </label>
  )
}
