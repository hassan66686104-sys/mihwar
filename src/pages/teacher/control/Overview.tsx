import { useState } from 'react'
import { useNavigate } from 'react-router'
import { JoinInfo } from '../../../components/JoinInfo'
import { TimerDisplay } from '../../../components/TimerDisplay'
import { ConfirmButton } from '../../../components/ui'
import { teacherApi } from '../../../lib/api'
import type { Mode, SessionSettings, TimerScope } from '../../../lib/api/types'
import { MODE_HINTS, MODE_LABELS } from '../../../lib/labels'
import { Check, NumberField } from '../NewSession'
import type { TimedPanelProps } from './types'

export function Overview({ data, act, busy, offset }: TimedPanelProps) {
  const nav = useNavigate()
  const s = data.session
  const st = s.settings
  const [q, setQ] = useState<string | null>(null)
  const [ins, setIns] = useState<string | null>(null)
  const setting = <K extends keyof SessionSettings>(k: K, v: SessionSettings[K]) =>
    act('setting', () => teacherApi.updateSession(s.id, { settings: { [k]: v } as Partial<SessionSettings> }))

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <section className="card p-4" aria-label="حالة الجلسة">
          <h2 className="mb-3 font-bold text-olive-800">حالة الجلسة</h2>
          <div className="flex flex-wrap gap-2">
            {(s.status === 'draft' || s.status === 'closed') && (
              <button className="btn-primary" disabled={busy === 'status'} onClick={() => act('status', () => teacherApi.setStatus(s.id, 'open'), s.status === 'closed' ? 'أُعيد فتح الجلسة' : 'فُتحت الجلسة')}>
                {s.status === 'closed' ? 'إعادة فتح الجلسة' : '▶ فتح الجلسة'}
              </button>
            )}
            {s.status === 'open' && (
              <button className="btn-gold" disabled={busy === 'status'} onClick={() => act('status', () => teacherApi.setStatus(s.id, 'paused'), 'أُوقفت الجلسة مؤقتًا')}>
                ⏸ إيقاف مؤقت
              </button>
            )}
            {s.status === 'paused' && (
              <button className="btn-primary" disabled={busy === 'status'} onClick={() => act('status', () => teacherApi.setStatus(s.id, 'open'), 'استُؤنفت الجلسة')}>
                ▶ استئناف
              </button>
            )}
            {(s.status === 'open' || s.status === 'paused') && (
              <ConfirmButton
                className="btn-danger"
                confirmText="سيُغلق الإرسال والتصويت لكل الطلاب، وتنتهي المؤقتات، ويُنشأ التقرير. يمكنك إعادة الفتح لاحقًا."
                onConfirm={async () => {
                  await act('status', () => teacherApi.setStatus(s.id, 'closed'), 'أُغلقت الجلسة وأُنشئ التقرير')
                }}
              >
                ⏹ إغلاق الجلسة
              </ConfirmButton>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">الإيقاف المؤقت يجمّد كل المؤقتات ويمنع الإرسال مع إبقاء الطلاب في الغرفة.</p>
        </section>

        <section className="card p-4" aria-label="المؤقت المركزي">
          <h2 className="mb-3 font-bold text-olive-800">المؤقت المركزي للجلسة</h2>
          <TimerControls sessionId={s.id} scope="session" timer={data.timers.session} offset={offset} act={act} defaultSeconds={s.duration_min * 60} />
        </section>

        <section className="card p-4" aria-label="نمط النقاش">
          <h2 className="mb-3 font-bold text-olive-800">نمط النقاش</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={s.mode === m}
                disabled={s.status === 'closed' || busy === 'mode'}
                onClick={() => act('mode', () => teacherApi.setMode(s.id, m), `النمط الآن: ${MODE_LABELS[m]}`)}
                className={`rounded-xl border p-3 text-start ${s.mode === m ? 'border-olive-500 bg-olive-50' : 'border-cream-300 hover:bg-cream-100'}`}
              >
                <span className="font-bold text-olive-800">{MODE_LABELS[m]}</span>
                <span className="block text-xs text-muted">{MODE_HINTS[m]}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            ضوابط التبديل: لا يمكن التبديل في جلسة مغلقة؛ المناظرة تتطلب فريقين على الأقل؛ الخروج من النقاش بالدور يُنهي دور المتحدث الحالي مع إبقاء قائمة الانتظار.
          </p>
        </section>

        <section className="card space-y-3 p-4" aria-label="السؤال والتعليمات">
          <h2 className="font-bold text-olive-800">السؤال المحوري والتعليمات</h2>
          {q === null ? (
            <div className="flex items-start gap-2">
              <p className="flex-1 font-semibold">{s.main_question}</p>
              <button className="btn-ghost btn-sm" onClick={() => setQ(s.main_question)}>
                تغيير
              </button>
            </div>
          ) : (
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault()
                await act('q', () => teacherApi.updateSession(s.id, { main_question: q }), 'حُدّث السؤال لدى جميع الطلاب')
                setQ(null)
              }}
            >
              <textarea className="input" rows={3} value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} aria-label="السؤال المحوري" />
              <div className="flex gap-2">
                <button className="btn-primary btn-sm">حفظ</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setQ(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          )}
          {ins === null ? (
            <div className="flex items-start gap-2">
              <p className="flex-1 text-sm text-muted">{s.instructions || 'لا توجد تعليمات.'}</p>
              <button className="btn-ghost btn-sm" onClick={() => setIns(s.instructions)}>
                تعديل
              </button>
            </div>
          ) : (
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault()
                await act('ins', () => teacherApi.updateSession(s.id, { instructions: ins }))
                setIns(null)
              }}
            >
              <textarea className="input" rows={3} value={ins} onChange={(e) => setIns(e.target.value)} maxLength={1000} aria-label="التعليمات" />
              <div className="flex gap-2">
                <button className="btn-primary btn-sm">حفظ</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setIns(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="card p-4" aria-label="سياسات المشاركة">
          <h2 className="mb-3 font-bold text-olive-800">سياسات المشاركة (تُطبَّق فورًا على الخادم)</h2>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <Check checked={st.posts_open} onChange={(v) => setting('posts_open', v)}>
              باب المشاركات مفتوح
            </Check>
            <Check checked={st.questions_open} onChange={(v) => setting('questions_open', v)}>
              باب الأسئلة مفتوح
            </Check>
            <Check checked={st.moderation} onChange={(v) => setting('moderation', v)}>
              مراجعة المشاركات قبل ظهورها
            </Check>
            <Check checked={st.replies_enabled} onChange={(v) => setting('replies_enabled', v)}>
              السماح بالردود
            </Check>
            <Check checked={st.reply_scope === 'team'} onChange={(v) => setting('reply_scope', v ? 'team' : 'all')}>
              الرد على الفريق نفسه فقط
            </Check>
            <Check checked={st.evidence_enabled} onChange={(v) => setting('evidence_enabled', v)}>
              إرفاق الأدلة والشواهد
            </Check>
            <Check checked={st.hand_raise_enabled} onChange={(v) => setting('hand_raise_enabled', v)}>
              طلب الحديث (رفع اليد)
            </Check>
            <Check checked={st.turn_posting === 'speaker_only'} onChange={(v) => setting('turn_posting', v ? 'speaker_only' : 'all')}>
              في النقاش بالدور: الكتابة للمتحدث فقط
            </Check>
            <Check checked={st.points_enabled} onChange={(v) => setting('points_enabled', v)}>
              نظام النقاط
            </Check>
            <Check checked={st.show_points_to_students} disabled={!st.points_enabled} onChange={(v) => setting('show_points_to_students', v)}>
              إظهار النقاط للطلاب
            </Check>
            <Check checked={st.show_own_history} onChange={(v) => setting('show_own_history', v)}>
              يرى الطالب مشاركاته المعلقة والمرفوضة
            </Check>
            <Check checked={st.allow_join_closed} onChange={(v) => setting('allow_join_closed', v)}>
              الدخول للاطلاع بعد الإغلاق
            </Check>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <NumberField label="حد المشاركات لكل طالب" value={st.max_posts_per_student} max={100} onChange={(n) => setting('max_posts_per_student', n)} />
            <NumberField label="حد الردود لكل طالب" value={st.max_replies_per_student} max={100} onChange={(n) => setting('max_replies_per_student', n)} />
            <label className="block">
              <span className="label">مهلة التعديل</span>
              <select className="input" value={st.edit_window_sec} onChange={(e) => setting('edit_window_sec', Number(e.target.value))}>
                <option value={0}>لا تعديل</option>
                <option value={60}>دقيقة</option>
                <option value={120}>دقيقتان</option>
                <option value={300}>5 دقائق</option>
              </select>
            </label>
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <JoinInfo joinCode={s.join_code} compact />
        {s.status === 'draft' && <p className="text-sm text-muted">الجلسة مسودة: لن يستطيع الطلاب الدخول قبل فتحها.</p>}
        <section className="card p-4 text-sm">
          <h2 className="mb-2 font-bold text-olive-800">ملخص سريع</h2>
          <ul className="space-y-1">
            <li>المشاركات المقبولة: {data.posts.filter((p) => p.status === 'approved' && !p.parent_id).length}</li>
            <li>الردود: {data.posts.filter((p) => p.status === 'approved' && p.parent_id).length}</li>
            <li>بانتظار المراجعة: {data.posts.filter((p) => p.status === 'pending').length}</li>
            <li>مشاركات بأدلة: {data.posts.filter((p) => p.evidence).length}</li>
            <li>لم يدخلوا بعد: {data.not_joined.length}</li>
          </ul>
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-bold text-olive-800">حذف الجلسة</h2>
          <p className="mb-3 text-sm text-muted">يحذف الجلسة وكل مشاركاتها وأصواتها وتقييماتها نهائيًا. يُسجَّل الحذف في سجل الإجراءات.</p>
          <ConfirmButton
            confirmText={`حذف «${s.title}» نهائيًا؟ لا يمكن التراجع.`}
            onConfirm={async () => {
              const r = await act('delete', () => teacherApi.deleteSession(s.id), 'حُذفت الجلسة')
              if (r !== undefined) nav('/teacher')
            }}
          >
            حذف الجلسة
          </ConfirmButton>
        </section>
      </aside>
    </div>
  )
}

export function TimerControls({
  sessionId,
  scope,
  timer,
  offset,
  act,
  defaultSeconds,
}: {
  sessionId: string
  scope: TimerScope
  timer: TimedPanelProps['data']['timers'][TimerScope]
  offset: { current: number }
  act: TimedPanelProps['act']
  defaultSeconds: number
}) {
  const [mins, setMins] = useState(Math.max(1, Math.round(defaultSeconds / 60)))
  const t = (action: 'start' | 'pause' | 'resume' | 'end' | 'add' | 'reset', seconds: number | null = null) =>
    act(`timer-${scope}`, () => teacherApi.timer(sessionId, scope, action, seconds))
  return (
    <div className="flex flex-wrap items-center gap-4">
      <TimerDisplay timer={timer} offset={offset} label={scope === 'session' ? 'المتبقي' : 'المرحلة'} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-sm">
          <input type="number" min={1} max={300} className="input w-20 py-1" value={mins} onChange={(e) => setMins(Number(e.target.value))} aria-label="المدة بالدقائق" />
          دقيقة
        </label>
        <button className="btn-primary btn-sm" onClick={() => t('start', mins * 60)}>
          بدء
        </button>
        {timer?.status === 'running' && (
          <button className="btn-ghost btn-sm" onClick={() => t('pause')}>
            إيقاف مؤقت
          </button>
        )}
        {timer?.status === 'paused' && (
          <button className="btn-ghost btn-sm" onClick={() => t('resume')}>
            استئناف
          </button>
        )}
        <button className="btn-ghost btn-sm" onClick={() => t('add', 60)}>
          +1 دقيقة
        </button>
        <button className="btn-ghost btn-sm" onClick={() => t('add', 300)}>
          +5 دقائق
        </button>
        <button className="btn-danger btn-sm" onClick={() => t('end')}>
          إنهاء
        </button>
      </div>
    </div>
  )
}
