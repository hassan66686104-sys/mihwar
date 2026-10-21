// شاشة العرض الصفي: تُفتح على جهاز العرض (السبورة الذكية)، وتعرض فقط ما يصح أن يراه الصف كله.
// لا تعرض المشاركات بانتظار المراجعة ولا المرفوضة ولا ملاحظات المعلم.
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router'
import { PollResults } from '../../components/Polls'
import { EvidenceView } from '../../components/PostCard'
import { TimerDisplay } from '../../components/TimerDisplay'
import { Alert, ConnectionBadge, Logo, Motto, PageLoader } from '../../components/ui'
import { joinUrl, useQr } from '../../components/JoinInfo'
import { teacherApi } from '../../lib/api'
import type { TeacherState } from '../../lib/api/types'
import { KIND_SHORT, MODE_LABELS, STATUS_LABELS, TEAM_COLORS } from '../../lib/labels'
import { useLiveState } from '../../lib/useLiveState'

type View = 'auto' | 'posts' | 'poll' | 'join'

export default function Present() {
  const { id = '' } = useParams()
  const fetcher = useCallback(() => teacherApi.state(id, 60), [id])
  const { data, error, connection, serverOffset } = useLiveState<TeacherState>(id, fetcher, { pollMs: 15000 })
  const [view, setView] = useState<View>('auto')
  const [hideNames, setHideNames] = useState(false)

  if (!data) return error ? <Alert tone="error">{error.message}</Alert> : <PageLoader label="جارٍ تحميل شاشة العرض…" />
  const s = data.session
  const stage = data.stages.find((x) => x.id === s.current_stage_id)
  const stageTeam = stage ? data.teams.find((t) => t.id === stage.team_id) : undefined
  const speaker = data.queue.find((q) => q.status === 'speaking')
  const waiting = data.queue.filter((q) => q.status === 'waiting')
  const openPoll = data.polls.find((p) => p.status === 'open')
  const lastClosed = data.polls.find((p) => p.status === 'closed')
  const approved = data.posts.filter((p) => p.status === 'approved' && !p.parent_id)
  const posts = [...approved.filter((p) => p.pinned), ...approved.filter((p) => !p.pinned)].slice(0, 6)
  const teams = new Map(data.teams.map((t) => [t.id, t]))
  const name = (n: string) => (hideNames ? 'طالب' : n)

  const shown: Exclude<View, 'auto'> =
    view !== 'auto' ? view : s.status === 'draft' ? 'join' : openPoll || s.mode === 'poll' ? 'poll' : 'posts'
  const poll = openPoll ?? lastClosed

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <div className="min-h-dvh bg-cream-50 p-6 text-olive-900 lg:p-10">
      {s.is_demo && <p className="mb-3 rounded-lg bg-gold-100 px-4 py-2 text-center font-bold text-gold-700">جلسة تجريبية — الأسماء والمشاركات غير حقيقية</p>}
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <Logo size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-lg text-muted">
            {s.lesson} · {MODE_LABELS[s.mode]} · {STATUS_LABELS[s.status]}
          </p>
        </div>
        <TimerDisplay timer={data.timers.session} offset={serverOffset} label="وقت الجلسة" />
        <div className="no-print flex flex-wrap items-center gap-2">
          <ConnectionBadge connection={connection} />
          <select className="input w-auto py-1" value={view} onChange={(e) => setView(e.target.value as View)} aria-label="ما يُعرض">
            <option value="auto">تلقائي</option>
            <option value="posts">المشاركات</option>
            <option value="poll">التصويت</option>
            <option value="join">رمز الدخول</option>
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={hideNames} onChange={(e) => setHideNames(e.target.checked)} />
            إخفاء الأسماء
          </label>
          <button className="btn-ghost btn-sm" onClick={fullscreen}>
            ملء الشاشة ⛶
          </button>
          <Link to={`/teacher/s/${id}`} className="btn-ghost btn-sm">
            الإدارة
          </Link>
        </div>
      </header>

      <section className="mb-8 rounded-3xl bg-olive-800 px-8 py-8 text-cream-50 shadow-lg">
        <p className="mb-2 text-xl text-gold-300">السؤال المحوري</p>
        <h1 className="text-3xl leading-relaxed font-extrabold lg:text-5xl lg:leading-snug">{s.main_question || s.title}</h1>
      </section>

      {s.status === 'paused' && <p className="mb-6 rounded-2xl bg-gold-100 p-4 text-center text-2xl font-bold text-gold-700">الجلسة متوقفة مؤقتًا</p>}
      {s.status === 'closed' && <p className="mb-6 rounded-2xl bg-stone-200 p-4 text-center text-2xl font-bold text-stone-700">انتهت الجلسة. شكرًا لمشاركتكم.</p>}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <main>
          {shown === 'join' && <JoinBig code={s.join_code} />}
          {shown === 'poll' &&
            (poll ? (
              <section className="card p-6">
                <p className="mb-1 text-lg text-muted">{poll.status === 'open' ? 'التصويت مفتوح الآن' : 'نتيجة آخر تصويت'}</p>
                <h2 className="mb-4 text-3xl font-extrabold">{poll.question}</h2>
                {poll.status === 'open' && poll.hide_results ? (
                  <p className="text-2xl">صوّت حتى الآن: {poll.ballots ?? 0} — النتائج تظهر بعد الإغلاق</p>
                ) : (
                  <PollResults poll={{ ...poll, options: poll.options.map((o) => ({ ...o, voters: null })) }} big />
                )}
              </section>
            ) : (
              <p className="text-2xl text-muted">لا يوجد تصويت بعد.</p>
            ))}
          {shown === 'posts' && (
            <section className="space-y-4" aria-label="المشاركات">
              {posts.length === 0 && <p className="text-2xl text-muted">لم تُعرض مشاركات بعد.</p>}
              {posts.map((p) => {
                const t = p.team_id ? teams.get(p.team_id) : undefined
                return (
                  <article key={p.id} className={`card p-5 ${p.pinned ? 'border-2 border-gold-400' : ''} ${t ? TEAM_COLORS[t.color].bg : ''}`}>
                    <p className="mb-2 text-lg text-muted">
                      {p.pinned && '📌 '}
                      <b className="text-olive-800">{p.is_teacher ? 'المعلم' : name(p.author_name)}</b> · {KIND_SHORT[p.kind]}
                      {t && ` · ${t.name}`}
                    </p>
                    <p className="text-2xl leading-relaxed whitespace-pre-wrap">{p.body}</p>
                    {p.evidence && (
                      <div className="mt-3 text-lg">
                        <EvidenceView e={p.evidence} />
                      </div>
                    )}
                  </article>
                )
              })}
            </section>
          )}
        </main>

        <aside className="space-y-6">
          {stage && (
            <section className={`card p-5 ${stageTeam ? TEAM_COLORS[stageTeam.color].bg : ''}`}>
              <p className="text-lg text-muted">المرحلة الحالية</p>
              <p className="text-3xl font-extrabold">{stage.label}</p>
              <p className="mb-3 text-xl">{stageTeam?.name ?? 'المعلم'}</p>
              <TimerDisplay timer={data.timers.stage} offset={serverOffset} label="وقت المرحلة" size="xl" />
            </section>
          )}
          {(speaker || waiting.length > 0) && (
            <section className="card p-5">
              <p className="text-lg text-muted">المتحدث الآن</p>
              <p className="mb-3 text-3xl font-extrabold">{speaker ? name(speaker.name) : '—'}</p>
              {speaker && <TimerDisplay timer={data.timers.turn} offset={serverOffset} label="وقت المداخلة" size="xl" />}
              {waiting.length > 0 && (
                <>
                  <p className="mt-4 text-lg text-muted">التالي في الدور</p>
                  <ol className="list-inside list-decimal text-2xl">
                    {waiting.slice(0, 5).map((w) => (
                      <li key={w.id}>{name(w.name)}</li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          )}
          {shown !== 'join' && s.status !== 'closed' && <JoinBig code={s.join_code} small />}
        </aside>
      </div>
      <Motto className="mt-10 text-center text-xl" />
    </div>
  )
}

function JoinBig({ code, small = false }: { code: string; small?: boolean }) {
  const url = joinUrl(code)
  const qr = useQr(url, small ? 220 : 420)
  return (
    <section className={`card flex flex-col items-center gap-3 text-center ${small ? 'p-4' : 'p-8'}`} aria-label="الدخول إلى الجلسة">
      <p className={small ? 'text-lg text-muted' : 'text-2xl text-muted'}>ادخل من هاتفك بمسح الرمز أو بكتابة رمز الجلسة</p>
      {qr && <img src={qr} alt="رمز QR لرابط الدخول" width={small ? 220 : 420} height={small ? 220 : 420} />}
      <p className={`font-mono font-extrabold tracking-[0.3em] ${small ? 'text-3xl' : 'text-6xl'}`} dir="ltr">
        {code}
      </p>
      <p className={`break-all ${small ? 'text-sm' : 'text-xl'} text-muted`} dir="ltr">
        {url}
      </p>
    </section>
  )
}
