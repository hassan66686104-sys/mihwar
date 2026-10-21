import { useState } from 'react'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { studentApi } from '../lib/api'
import { toAppError } from '../lib/api/errors'
import type { Poll } from '../lib/api/types'
import { POLL_KIND_LABELS, POLL_PHASE_LABELS } from '../lib/labels'
import { Badge } from './ui'

export function PollResults({ poll, big = false }: { poll: Poll; big?: boolean }) {
  const total = poll.ballots ?? 0
  const votes = poll.options.reduce((n, o) => n + (o.count ?? 0), 0)
  const data = poll.options.map((o) => ({
    name: o.label,
    count: o.count ?? 0,
    pct: votes ? Math.round(((o.count ?? 0) / (poll.kind === 'multi' ? total || 1 : votes)) * 100) : 0,
  }))
  const height = Math.max(120, data.length * (big ? 64 : 44))
  return (
    <div>
      <div style={{ height }} dir="ltr" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 48 }}>
            <XAxis type="number" hide domain={[0, Math.max(1, ...data.map((d) => d.count))]} />
            <YAxis type="category" dataKey="name" orientation="right" width={big ? 260 : 150} tick={{ fontSize: big ? 18 : 13, fill: '#26291f' }} />
            <Bar dataKey="count" radius={[6, 0, 0, 6]} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={i % 2 ? '#c9a85a' : '#506235'} />
              ))}
              <LabelList dataKey="count" position="left" style={{ fontSize: big ? 18 : 13, fontWeight: 700, fill: '#26291f' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* جدول نصي للنتائج: يقرؤه قارئ الشاشة ويوضح العدد والنسبة */}
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">نتائج التصويت</caption>
        <thead className="text-muted">
          <tr>
            <th className="text-start font-semibold">الخيار</th>
            <th className="font-semibold">العدد</th>
            <th className="font-semibold">النسبة</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.name} className="border-t border-cream-200">
              <td className="py-1">{d.name}</td>
              <td className="text-center tabular-nums">{d.count}</td>
              <td className="text-center tabular-nums">{d.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted">
        عدد المصوّتين: {total}
        {poll.kind === 'multi' && ' (النسبة من عدد المصوّتين لأن الاختيار متعدد)'}
      </p>
    </div>
  )
}

export function PollVoteCard({ poll, token, canVote, onVoted }: { poll: Poll; token: string; canVote: boolean; onVoted: () => void }) {
  const [sel, setSel] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const voted = (poll.my_choice?.length ?? 0) > 0
  const multi = poll.kind === 'multi'

  const toggle = (id: string) => {
    if (!multi) return setSel([id])
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < poll.max_choices ? [...s, id] : s))
  }

  const vote = async () => {
    if (busy || sel.length === 0) return
    setBusy(true)
    setErr(null)
    try {
      await studentApi.vote(token, poll.id, sel)
      onVoted()
    } catch (e) {
      setErr(toAppError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-4" aria-labelledby={`poll-${poll.id}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge className="bg-olive-100 text-olive-800">{POLL_PHASE_LABELS[poll.phase]}</Badge>
        <Badge className="bg-cream-200 text-olive-800">{POLL_KIND_LABELS[poll.kind]}</Badge>
        <Badge className={poll.status === 'open' ? 'bg-olive-700 text-cream-50' : 'bg-stone-200 text-stone-700'}>{poll.status === 'open' ? 'مفتوح' : 'مغلق'}</Badge>
      </div>
      <h3 id={`poll-${poll.id}`} className="mb-3 text-lg font-bold text-olive-900">
        {poll.question}
      </h3>
      {voted ? (
        <p className="mb-3 rounded-xl bg-olive-50 px-3 py-2 text-sm font-semibold text-olive-800">
          ✓ سُجّل صوتك: {poll.options.filter((o) => poll.my_choice?.includes(o.id)).map((o) => o.label).join('، ')}
        </p>
      ) : poll.status === 'open' ? (
        <fieldset disabled={!canVote || busy}>
          <legend className="sr-only">{poll.question}</legend>
          <div className="grid gap-2">
            {poll.options.map((o) => (
              <label
                key={o.id}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${sel.includes(o.id) ? 'border-olive-500 bg-olive-50 font-bold' : 'border-cream-300 bg-white'}`}
              >
                <input type={multi ? 'checkbox' : 'radio'} name={`poll-${poll.id}`} checked={sel.includes(o.id)} onChange={() => toggle(o.id)} className="h-5 w-5 accent-olive-700" />
                {o.label}
              </label>
            ))}
          </div>
          {multi && <p className="mt-1 text-xs text-muted">يمكنك اختيار حتى {poll.max_choices} خيارات.</p>}
          <p className="mt-2 text-xs text-muted">صوت واحد فقط، ولا يمكن تغييره بعد الإرسال.</p>
          {err && <p className="mt-2 text-sm font-semibold text-red-700">{err}</p>}
          <button type="button" className="btn-primary mt-3 w-full" onClick={vote} disabled={sel.length === 0 || busy || !canVote}>
            {busy ? 'جارٍ تسجيل الصوت…' : 'إرسال صوتي'}
          </button>
        </fieldset>
      ) : (
        <p className="mb-3 text-sm text-muted">أُغلق التصويت ولم تصوّت فيه.</p>
      )}
      {poll.results_visible ? (
        <div className="mt-4">
          <PollResults poll={poll} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">النتائج مخفية حتى يغلق المعلم التصويت.</p>
      )}
    </section>
  )
}
