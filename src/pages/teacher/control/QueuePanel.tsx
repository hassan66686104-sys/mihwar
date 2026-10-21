import { useState } from 'react'
import { TimerDisplay } from '../../../components/TimerDisplay'
import { Badge } from '../../../components/ui'
import { teacherApi } from '../../../lib/api'
import { fmtTime } from '../../../lib/labels'
import type { TimedPanelProps } from './types'

const STATUS: Record<string, string> = { done: 'انتهى دوره', skipped: 'تُخطّي', withdrawn: 'سحب طلبه', waiting: 'ينتظر', speaking: 'يتحدث' }

export function QueuePanel({ data, act, busy, offset }: TimedPanelProps) {
  const s = data.session
  const [secs, setSecs] = useState(s.settings.turn_seconds)
  const [custom, setCustom] = useState('')
  const seconds = custom ? Math.max(5, Math.min(600, Number(custom) || secs)) : secs
  const speaker = data.queue.find((q) => q.status === 'speaking')
  const waiting = data.queue.filter((q) => q.status === 'waiting')
  const history = data.queue.filter((q) => !['waiting', 'speaking'].includes(q.status)).reverse()
  const q = (action: 'grant' | 'next' | 'skip' | 'end' | 'extend' | 'clear', entry: string | null = null, sec: number | null = seconds) =>
    act('queue', () => teacherApi.queue(s.id, action, entry, sec))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card space-y-4 p-4" aria-label="المتحدث الحالي">
        <h2 className="font-bold text-olive-800">المتحدث الحالي</h2>
        {s.mode !== 'turns' && <p className="text-sm text-gold-700">النمط الحالي ليس «النقاش بالدور»؛ يمكنك مع ذلك إدارة طلبات الحديث هنا.</p>}
        {speaker ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1">
              <p className="text-2xl font-extrabold text-olive-900">{speaker.name}</p>
              <p className="text-sm text-muted">بدأ {fmtTime(speaker.granted_at)}</p>
            </div>
            <TimerDisplay timer={data.timers.turn} offset={offset} label="وقت المداخلة" />
          </div>
        ) : (
          <p className="text-muted">لا يوجد متحدث الآن.</p>
        )}
        <fieldset>
          <legend className="label">مدة المداخلة</legend>
          <div className="flex flex-wrap items-center gap-2">
            {[30, 45, 60, 90].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={!custom && secs === n}
                onClick={() => {
                  setSecs(n)
                  setCustom('')
                }}
                className={`chip px-3 py-1.5 text-sm ${!custom && secs === n ? 'bg-olive-700 text-cream-50' : 'bg-cream-200 text-olive-800'}`}
              >
                {n} ث
              </button>
            ))}
            <input type="number" min={5} max={600} className="input w-28 py-1" placeholder="مخصصة" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="مدة مخصصة بالثواني" />
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy === 'queue' || waiting.length === 0} onClick={() => q('next')}>
            منح الدور للتالي
          </button>
          {speaker && (
            <>
              <button className="btn-ghost" onClick={() => q('extend', null, 15)}>
                +15 ث
              </button>
              <button className="btn-ghost" onClick={() => q('extend', null, 30)}>
                +30 ث
              </button>
              <button className="btn-danger" onClick={() => q('end')}>
                سحب الدور / إنهاء
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-muted">
          عند انتهاء الوقت: {s.settings.turn_end_action === 'next' ? 'ينتقل الدور تلقائيًا للتالي' : 'يُغلق إرسال المداخلة ويبقى الدور حتى تنقله'} (غيّره من «التحكم»
          ← السياسات أو إعداد الجلسة).
        </p>
      </section>

      <section className="card p-4" aria-label="قائمة الانتظار">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-olive-800">قائمة الانتظار ({waiting.length})</h2>
          {waiting.length > 0 && (
            <button className="btn-ghost btn-sm" onClick={() => q('clear')}>
              تفريغ القائمة
            </button>
          )}
        </div>
        {waiting.length === 0 ? (
          <p className="text-muted">لا توجد طلبات حديث.</p>
        ) : (
          <ol className="space-y-2">
            {waiting.map((w, i) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream-100 px-3 py-2">
                <span className="w-6 text-center font-bold text-gold-600">{i + 1}</span>
                <span className="flex-1 font-semibold">{w.name}</span>
                <span className="text-xs text-muted">{fmtTime(w.requested_at)}</span>
                <button className="btn-primary btn-sm" onClick={() => q('grant', w.id)}>
                  منح الدور
                </button>
                <button className="btn-ghost btn-sm" onClick={() => q('skip', w.id)}>
                  تخطٍّ
                </button>
              </li>
            ))}
          </ol>
        )}
        {history.length > 0 && (
          <>
            <h3 className="mt-5 mb-2 text-sm font-bold text-muted">آخر الأدوار (30 دقيقة)</h3>
            <ul className="space-y-1 text-sm">
              {history.slice(0, 15).map((h) => (
                <li key={h.id} className="flex items-center gap-2">
                  <span className="flex-1">{h.name}</span>
                  <Badge className="bg-cream-200 text-muted">{STATUS[h.status]}</Badge>
                  <button className="btn-ghost btn-sm" onClick={() => q('grant', h.id)}>
                    إعادة الدور
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
