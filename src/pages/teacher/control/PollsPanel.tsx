import { useState } from 'react'
import { PollResults } from '../../../components/Polls'
import { Badge, ConfirmButton } from '../../../components/ui'
import { teacherApi } from '../../../lib/api'
import type { PollKind, PollPhase } from '../../../lib/api/types'
import { POLL_KIND_LABELS, POLL_PHASE_LABELS, fmtTime } from '../../../lib/labels'
import type { PanelProps } from './types'

const POLL_STATUS: Record<string, [string, string]> = {
  draft: ['لم يُفتح بعد', 'bg-cream-200 text-muted'],
  open: ['مفتوح للتصويت', 'bg-olive-100 text-olive-800'],
  closed: ['مغلق', 'bg-stone-200 text-stone-700'],
}

export function PollsPanel({ data, act, busy }: PanelProps) {
  const s = data.session
  const [question, setQuestion] = useState('')
  const [kind, setKind] = useState<PollKind>('single')
  const [phase, setPhase] = useState<PollPhase>('general')
  const [options, setOptions] = useState(['', ''])
  const [showVoters, setShowVoters] = useState(false)
  const [hideResults, setHideResults] = useState(true)
  const [maxChoices, setMaxChoices] = useState(2)
  const needsOptions = kind === 'single' || kind === 'multi'
  const filled = options.map((o) => o.trim()).filter(Boolean)
  const valid = question.trim().length > 0 && (!needsOptions || filled.length >= 2)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await act(
      'poll',
      () =>
        teacherApi.createPoll(s.id, {
          question: question.trim(),
          kind,
          phase,
          options: needsOptions ? filled : [],
          show_voters: showVoters,
          hide_results: hideResults,
          max_choices: kind === 'multi' ? maxChoices : 1,
        }),
      'أُنشئ التصويت (لم يُفتح بعد)',
    )
    if (r) {
      setQuestion('')
      setOptions(['', ''])
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        {data.polls.length === 0 && <p className="text-muted">لا توجد تصويتات بعد. أنشئ تصويتًا من النموذج.</p>}
        {data.polls.map((p) => {
          const [label, style] = POLL_STATUS[p.status]
          return (
            <section key={p.id} className="card p-4" aria-label={p.question}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="flex-1 text-lg font-bold text-olive-900">{p.question}</h3>
                <Badge className={style}>{label}</Badge>
                <Badge className="bg-cream-200 text-olive-800">{POLL_PHASE_LABELS[p.phase]}</Badge>
                <Badge className="bg-cream-200 text-olive-800">{POLL_KIND_LABELS[p.kind]}</Badge>
              </div>
              <p className="mb-3 text-xs text-muted">
                المصوّتون: {p.ballots ?? 0}
                {p.opened_at && ` · فُتح ${fmtTime(p.opened_at)}`}
                {p.closed_at && ` · أُغلق ${fmtTime(p.closed_at)}`}
                {' · '}
                {p.hide_results ? 'النتائج مخفية عن الطلاب حتى الإغلاق' : 'النتائج ظاهرة للطلاب أثناء التصويت'}
                {p.show_voters ? ' · أسماء المصوّتين ظاهرة للمعلم' : ' · تصويت بلا أسماء'}
              </p>
              <PollResults poll={p} />
              {p.show_voters && p.options.some((o) => o.voters?.length) && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-olive-700">أسماء المصوّتين</summary>
                  <ul className="mt-1 space-y-1">
                    {p.options.map((o) => (
                      <li key={o.id}>
                        <b>{o.label}:</b> {o.voters?.join('، ') || '—'}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {p.status === 'draft' && (
                  <button className="btn-primary btn-sm" disabled={busy === 'poll'} onClick={() => act('poll', () => teacherApi.setPollStatus(p.id, 'open'), 'فُتح التصويت')}>
                    فتح التصويت
                  </button>
                )}
                {p.status === 'open' && (
                  <button className="btn-gold btn-sm" disabled={busy === 'poll'} onClick={() => act('poll', () => teacherApi.setPollStatus(p.id, 'closed'), 'أُغلق التصويت')}>
                    إغلاق التصويت
                  </button>
                )}
                <ConfirmButton confirmText="حذف التصويت وكل أصواته نهائيًا؟" onConfirm={async () => void (await act('poll', () => teacherApi.deletePoll(p.id), 'حُذف التصويت'))}>
                  حذف
                </ConfirmButton>
              </div>
            </section>
          )
        })}
      </div>

      <aside>
        <form className="card sticky top-4 space-y-3 p-4" onSubmit={create} aria-label="إنشاء تصويت">
          <h2 className="font-bold text-olive-800">تصويت جديد</h2>
          <label className="block">
            <span className="label">السؤال</span>
            <textarea className="input" rows={2} maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="label">النوع</span>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as PollKind)}>
                {(Object.keys(POLL_KIND_LABELS) as PollKind[]).map((k) => (
                  <option key={k} value={k}>
                    {POLL_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">التوقيت</span>
              <select className="input" value={phase} onChange={(e) => setPhase(e.target.value as PollPhase)}>
                {(Object.keys(POLL_PHASE_LABELS) as PollPhase[]).map((k) => (
                  <option key={k} value={k}>
                    {POLL_PHASE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {kind === 'yesno' && <p className="text-sm text-muted">الخياران: نعم / لا.</p>}
          {kind === 'scale' && <p className="text-sm text-muted">المقياس: لا أوافق بشدة ← أوافق بشدة (خمس درجات).</p>}
          {needsOptions && (
            <fieldset className="space-y-2">
              <legend className="label">الخيارات (2 إلى 10)</legend>
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="input"
                    value={o}
                    maxLength={120}
                    aria-label={`الخيار ${i + 1}`}
                    onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  {options.length > 2 && (
                    <button type="button" className="btn-ghost btn-sm" aria-label={`حذف الخيار ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setOptions([...options, ''])}>
                  + خيار
                </button>
              )}
            </fieldset>
          )}
          {kind === 'multi' && (
            <label className="block">
              <span className="label">أقصى عدد اختيارات للطالب</span>
              <input type="number" min={1} max={Math.max(1, filled.length)} className="input w-24" value={maxChoices} onChange={(e) => setMaxChoices(Number(e.target.value))} />
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hideResults} onChange={(e) => setHideResults(e.target.checked)} />
            إخفاء النتائج عن الطلاب حتى إغلاق التصويت
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showVoters} onChange={(e) => setShowVoters(e.target.checked)} />
            إظهار أسماء المصوّتين للمعلم
          </label>
          <button className="btn-primary w-full" disabled={!valid || busy === 'poll'}>
            إنشاء
          </button>
          <p className="text-xs text-muted">يُنشأ التصويت مغلقًا، ثم تفتحه متى شئت. لكل طالب صوت واحد يُحفظ على الخادم.</p>
        </form>
      </aside>
    </div>
  )
}
