import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Composer } from '../../components/Composer'
import { PollVoteCard } from '../../components/Polls'
import { PostCard, buildThreads, interactionCount } from '../../components/PostCard'
import { TimerDisplay } from '../../components/TimerDisplay'
import { Alert, Badge, ConnectionBadge, DemoBanner, Logo, Modal, Motto, OfflineBar, PageLoader, useToast } from '../../components/ui'
import { studentApi } from '../../lib/api'
import { toAppError } from '../../lib/api/errors'
import type { Post, PostKind, StudentState, Team } from '../../lib/api/types'
import { MODE_LABELS, STATUS_LABELS, STATUS_STYLES, STUDENT_KINDS, TEAM_COLORS } from '../../lib/labels'
import { credentials } from '../../lib/storage'
import { isRunning } from '../../lib/timer'
import { serverNow, useLiveState, useTick } from '../../lib/useLiveState'
import { useMedia } from '../../lib/useMedia'

type Tab = 'discussion' | 'polls' | 'people' | 'mine'

export default function StudentRoom() {
  const { sessionId = '' } = useParams()
  const cred = credentials.get(sessionId)
  if (!cred) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <Logo />
        <Alert tone="warn" className="mt-6">
          لم تدخل هذه الجلسة من هذا الجهاز بعد. ادخل برمز الجلسة ورمزك الشخصي.
        </Alert>
        <Link to="/join" className="btn-primary mt-4">
          الدخول إلى جلسة
        </Link>
      </main>
    )
  }
  return <Room sessionId={sessionId} token={cred.token} joinCode={cred.joinCode} />
}

function Room({ sessionId, token, joinCode }: { sessionId: string; token: string; joinCode: string }) {
  const toast = useToast()
  const fetcher = useCallback(() => studentApi.state(token), [token])
  const { data, error, connection, refresh, serverOffset } = useLiveState<StudentState>(sessionId, fetcher)
  const [tab, setTab] = useState<Tab>('discussion')
  const [sort, setSort] = useState<'latest' | 'active'>('latest')
  const [replyTo, setReplyTo] = useState<Post | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [olderBusy, setOlderBusy] = useState(false)
  const [older, setOlder] = useState<Post[]>([])
  const desktop = useMedia('(min-width: 1024px)')
  useTick(1000)

  // نبضة حضور دورية حتى يرى المعلم من هو متصل
  useEffect(() => {
    const id = setInterval(() => void studentApi.heartbeat(token).catch(() => {}), 20000)
    return () => clearInterval(id)
  }, [token])

  if (error?.code === 'MH_TOKEN_INVALID' || error?.code === 'MH_REVOKED') {
    credentials.clear(sessionId)
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <Logo />
        <Alert tone="error" className="mt-6">
          {error.message}
        </Alert>
        <Link to={`/join/${joinCode}`} className="btn-primary mt-4">
          الدخول مرة أخرى
        </Link>
      </main>
    )
  }
  if (!data) return error ? <Alert tone="error" className="m-4">{error.message}</Alert> : <PageLoader label="جارٍ الدخول إلى غرفة النقاش…" />

  const s = data.session
  if (data.me.status === 'pending') {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <Logo />
        <h1 className="mt-6 text-xl font-bold text-olive-800">{s.title}</h1>
        <Alert tone="info" className="mt-4">
          أهلًا {data.me.display_name}. طلب دخولك بانتظار موافقة المعلم، وستُفتح الغرفة تلقائيًا بعد الاعتماد.
        </Alert>
        <div className="mt-4">
          <ConnectionBadge connection={connection} />
        </div>
      </main>
    )
  }

  const st = s.settings!
  const now = serverNow(serverOffset)
  const teams = new Map<string, Team>((data.teams ?? []).map((t) => [t.id, t]))
  const myTeam = data.me.team_id ? teams.get(data.me.team_id) : undefined
  const stage = data.stages?.find((x) => x.id === s.current_stage_id)
  const speaker = data.queue?.find((q) => q.status === 'speaking')
  const myQueue = data.queue?.find((q) => q.member_id === data.me.id)
  const waitingAhead = myQueue?.status === 'waiting' ? (data.queue ?? []).filter((q) => q.status === 'waiting' && q.seq < myQueue.seq).length : 0
  const sessionEnded = data.timers?.session?.status === 'ended' || (data.timers?.session?.status === 'running' && !isRunning(data.timers.session, now))
  const allPosts = mergePosts(data.posts ?? [], older)

  // تلميحات الواجهة فقط: الخادم يتحقق من كل ذلك عند الإرسال
  let disabledReason: string | null = null
  let allowedKinds: PostKind[] = STUDENT_KINDS
  if (s.status === 'paused') disabledReason = 'الجلسة متوقفة مؤقتًا'
  else if (s.status !== 'open') disabledReason = 'الجلسة مغلقة'
  else if (sessionEnded) disabledReason = 'انتهى وقت الجلسة'
  else {
    const onlyQuestions = (why: string) => {
      if (st.questions_open) allowedKinds = ['question']
      else disabledReason = why
    }
    if (!st.posts_open) onlyQuestions('أغلق المعلم باب المشاركات')
    else if (s.mode === 'turns' && st.turn_posting === 'speaker_only' && speaker?.member_id !== data.me.id) onlyQuestions('انتظر دورك في الحديث')
    else if (s.mode === 'debate' && (!stage || !stage.team_id || stage.team_id !== data.me.team_id))
      onlyQuestions(stage ? 'هذه المرحلة لفريق آخر' : 'لم تبدأ مرحلة المناظرة بعد')
    else if (st.max_posts_per_student > 0 && (data.me.post_count ?? 0) >= st.max_posts_per_student) onlyQuestions('بلغت الحد الأقصى لمشاركاتك')
  }
  const replyBlocked = s.status !== 'open' || sessionEnded || !st.replies_enabled || (st.max_replies_per_student > 0 && (data.me.reply_count ?? 0) >= st.max_replies_per_student)

  const loadOlder = async () => {
    const last = allPosts[allPosts.length - 1]
    if (!last) return
    setOlderBusy(true)
    try {
      const more = await studentApi.postsBefore(token, last.created_at)
      setOlder((o) => [...o, ...(more ?? [])])
    } catch (e) {
      toast('error', toAppError(e).message)
    } finally {
      setOlderBusy(false)
    }
  }

  const raiseHand = async () => {
    try {
      if (myQueue?.status === 'waiting') await studentApi.cancelSpeak(token)
      else await studentApi.requestSpeak(token)
      await refresh()
    } catch (e) {
      toast('error', toAppError(e).message)
    }
  }

  const composer = (
    <Composer
      key={allowedKinds.join(',')}
      sessionId={sessionId}
      token={token}
      topics={data.topics}
      evidenceEnabled={st.evidence_enabled}
      allowedKinds={allowedKinds}
      disabledReason={disabledReason}
      onSaved={() => void refresh()}
      onDone={desktop ? undefined : () => setComposeOpen(false)}
      autoFocus={!desktop}
    />
  )

  return (
    <div className="min-h-dvh pb-28 lg:pb-8">
      <OfflineBar connection={connection} />
      <header className="border-b border-cream-300 bg-cream-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Logo size="sm" />
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <ConnectionBadge connection={connection} />
            <Badge className={STATUS_STYLES[s.status]}>الجلسة {STATUS_LABELS[s.status]}</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">
        {s.is_demo && <DemoBanner className="mb-4" />}
        <section className="card mb-4 p-4 md:p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gold-600">
                {s.lesson && `${s.lesson} · `}
                {MODE_LABELS[s.mode!]} · المعلم: {s.teacher_name} · المشاركون: {data.members?.length ?? 0}
              </p>
              <h1 className="mt-1 text-xl font-extrabold text-olive-900 md:text-2xl">{s.main_question}</h1>
              {s.instructions && <p className="mt-2 text-sm text-muted">{s.instructions}</p>}
              <p className="mt-2 text-sm">
                أنت: <strong>{data.me.display_name}</strong>
                {data.me.role_label && <> · دورك: <strong>{data.me.role_label}</strong></>}
                {myTeam && <> · فريقك: <strong>{myTeam.name}</strong></>}
                {data.me.points != null && <> · نقاطك: <strong className="tabular-nums">{data.me.points}</strong></>}
              </p>
            </div>
            <div className="flex gap-2">
              <TimerDisplay timer={data.timers?.session} offset={serverOffset} label="وقت الجلسة" size="sm" />
              {s.mode === 'debate' && stage && <TimerDisplay timer={data.timers?.stage} offset={serverOffset} label="وقت المرحلة" size="sm" />}
              {s.mode === 'turns' && speaker && <TimerDisplay timer={data.timers?.turn} offset={serverOffset} label="وقت المداخلة" size="sm" />}
            </div>
          </div>
          {(data.topics?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.topics!.map((t) => (
                <span key={t.id} className="chip border border-olive-200 bg-olive-50 text-olive-800" title={t.body}>
                  محور: {t.title}
                </span>
              ))}
            </div>
          )}
        </section>

        {s.status !== 'open' && (
          <Alert tone={s.status === 'paused' ? 'warn' : 'info'} className="mb-4">
            {s.status === 'paused' ? 'أوقف المعلم الجلسة مؤقتًا. يمكنك القراءة، وستُفتح المشاركة عند الاستئناف.' : 'الجلسة مغلقة. يمكنك مراجعة المشاركات فقط.'}
          </Alert>
        )}
        {sessionEnded && s.status === 'open' && (
          <Alert tone="warn" className="mb-4">
            انتهى وقت الجلسة، وأُغلق إرسال المشاركات.
          </Alert>
        )}

        {s.mode === 'debate' && <DebateBanner data={data} teams={teams} />}
        {s.mode === 'turns' || st.hand_raise_enabled ? (
          <TurnsPanel data={data} myQueue={myQueue} waitingAhead={waitingAhead} speaker={speaker} onRaise={raiseHand} enabled={st.hand_raise_enabled && s.status === 'open'} prominent={s.mode === 'turns'} />
        ) : null}

        <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-cream-200 p-1" aria-label="أقسام الغرفة">
          {(
            [
              ['discussion', 'النقاش'],
              ['polls', `التصويت${(data.polls ?? []).some((p) => p.status === 'open' && !(p.my_choice?.length ?? 0)) ? ' •' : ''}`],
              ['people', 'المشاركون'],
              ['mine', 'مشاركاتي'],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${tab === k ? 'bg-cream-50 text-olive-800 shadow' : 'text-muted'}`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            {tab === 'discussion' && (
              <Feed
                posts={allPosts}
                teams={teams}
                sort={sort}
                setSort={setSort}
                debate={s.mode === 'debate'}
                stages={data.stages ?? []}
                onReply={replyBlocked ? null : setReplyTo}
                hasMore={(data.post_total ?? 0) > allPosts.filter((p) => p.status === 'approved').length}
                loadOlder={loadOlder}
                olderBusy={olderBusy}
              />
            )}
            {tab === 'polls' && (
              <div className="space-y-4">
                {(data.polls ?? []).length === 0 && <p className="text-muted">لا توجد تصويتات حتى الآن.</p>}
                {[...(data.polls ?? [])].reverse().map((p) => (
                  <PollVoteCard key={p.id} poll={p} token={token} canVote={s.status === 'open'} onVoted={() => void refresh()} />
                ))}
              </div>
            )}
            {tab === 'people' && <People data={data} teams={teams} />}
            {tab === 'mine' && (
              <div className="space-y-3">
                {!st.show_own_history && <p className="text-sm text-muted">يعرض هذا القسم مشاركاتك المقبولة فقط بحسب إعداد المعلم.</p>}
                {allPosts.filter((p) => p.mine).length === 0 ? (
                  <p className="text-muted">لم تكتب مشاركات بعد.</p>
                ) : (
                  allPosts.filter((p) => p.mine).map((p) => <PostCard key={p.id} post={p} team={p.team_id ? teams.get(p.team_id) : undefined} />)
                )}
                <p className="text-sm text-muted">
                  مشاركاتك: {data.me.post_count ?? 0}
                  {st.max_posts_per_student > 0 && ` من ${st.max_posts_per_student}`} · ردودك: {data.me.reply_count ?? 0}
                  {st.max_replies_per_student > 0 && ` من ${st.max_replies_per_student}`}
                  {st.edit_window_sec > 0 && ` · يمكن تعديل المشاركة خلال ${Math.round(st.edit_window_sec / 60) || 1} دقيقة من إرسالها`}
                </p>
              </div>
            )}
          </div>

          {desktop && (
            <aside className="space-y-4">
              <section className="card sticky top-4 p-4" aria-label="كتابة مشاركة">
                <h2 className="mb-3 font-bold text-olive-800">مشاركة جديدة</h2>
                {composer}
              </section>
            </aside>
          )}
        </div>
        <Motto className="mt-8 text-center text-sm" />
      </main>

      {!desktop && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-cream-300 bg-cream-50/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button type="button" className="btn-primary w-full text-lg" onClick={() => setComposeOpen(true)}>
            ✍️ {disabledReason ? disabledReason : allowedKinds.length === 1 ? 'اطرح سؤالًا' : 'اكتب مشاركة'}
          </button>
        </div>
      )}
      <Modal open={!desktop && composeOpen} onClose={() => setComposeOpen(false)} title="مشاركة جديدة">
        {composer}
      </Modal>
      <Modal open={!!replyTo} onClose={() => setReplyTo(null)} title={replyTo ? `الرد على ${replyTo.author_name}` : ''}>
        {replyTo && (
          <>
            <p className="mb-2 line-clamp-3 rounded-lg bg-cream-200 px-3 py-2 text-sm">{replyTo.body}</p>
            <Composer
              sessionId={sessionId}
              token={token}
              parentId={replyTo.id}
              evidenceEnabled={st.evidence_enabled}
              allowedKinds={['rebuttal', 'question', 'opinion', 'quran', 'hadith', 'fiqh', 'textbook', 'example']}
              onSaved={() => void refresh()}
              onDone={() => setReplyTo(null)}
              compact
              autoFocus
            />
          </>
        )}
      </Modal>
    </div>
  )
}

function mergePosts(fresh: Post[], older: Post[]) {
  const seen = new Set(fresh.map((p) => p.id))
  return [...fresh, ...older.filter((p) => !seen.has(p.id))]
}

function Feed({
  posts,
  teams,
  sort,
  setSort,
  debate,
  stages,
  onReply,
  hasMore,
  loadOlder,
  olderBusy,
}: {
  posts: Post[]
  teams: Map<string, Team>
  sort: 'latest' | 'active'
  setSort: (s: 'latest' | 'active') => void
  debate: boolean
  stages: StudentState['stages'] & object
  onReply: ((p: Post) => void) | null
  hasMore: boolean
  loadOlder: () => void
  olderBusy: boolean
}) {
  const { roots, childrenOf } = useMemo(() => buildThreads(posts), [posts])
  const sorted = useMemo(() => {
    const list = [...roots]
    if (sort === 'active') list.sort((a, b) => interactionCount(b.id, childrenOf) - interactionCount(a.id, childrenOf) || b.created_at.localeCompare(a.created_at))
    else if (debate) list.sort((a, b) => a.created_at.localeCompare(b.created_at))
    else list.sort((a, b) => b.created_at.localeCompare(a.created_at))
    return [...list.filter((p) => p.pinned), ...list.filter((p) => !p.pinned)]
  }, [roots, sort, childrenOf, debate])

  const render = (p: Post, depth: number): React.ReactNode => (
    <PostCard
      key={p.id}
      post={p}
      depth={depth}
      team={p.team_id ? teams.get(p.team_id) : undefined}
      actions={
        onReply && p.status === 'approved' && !p.replies_locked && depth < 3 ? (
          <button type="button" className="btn-ghost btn-sm" onClick={() => onReply(p)}>
            ↩︎ رد
          </button>
        ) : undefined
      }
    >
      {childrenOf(p.id).length > 0 ? childrenOf(p.id).map((c) => render(c, depth + 1)) : null}
    </PostCard>
  )

  return (
    <section aria-label="المشاركات">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-bold text-olive-800">المشاركات</h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">الترتيب:</span>
          <select className="input w-auto py-1" value={sort} onChange={(e) => setSort(e.target.value as 'latest' | 'active')}>
            <option value="latest">{debate ? 'تسلسل المناظرة' : 'الأحدث'}</option>
            <option value="active">الأكثر تفاعلًا</option>
          </select>
        </label>
      </div>
      {sort === 'active' && <p className="mb-2 text-xs text-muted">«الأكثر تفاعلًا» يعني عدد الردود فقط، وليس دليلًا على صحة الرأي أو قوة الدليل.</p>}
      {debate && stages.length > 0 && sort === 'latest' ? (
        <DebateColumns posts={sorted} teams={teams} stages={stages} render={render} />
      ) : sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-300 p-8 text-center text-muted">لا توجد مشاركات بعد. كن أول من يشارك برأي مدعوم بدليل.</p>
      ) : (
        <div className="space-y-3">{sorted.map((p) => render(p, 0))}</div>
      )}
      {hasMore && (
        <button type="button" className="btn-ghost mt-4 w-full" onClick={loadOlder} disabled={olderBusy}>
          {olderBusy ? 'جارٍ التحميل…' : 'تحميل مشاركات أقدم'}
        </button>
      )}
    </section>
  )
}

function DebateColumns({ posts, teams, stages, render }: { posts: Post[]; teams: Map<string, Team>; stages: NonNullable<StudentState['stages']>; render: (p: Post, d: number) => React.ReactNode }) {
  return (
    <div className="space-y-5">
      {stages.map((stg) => {
        const items = posts.filter((p) => p.stage_id === stg.id)
        if (items.length === 0) return null
        const team = stg.team_id ? teams.get(stg.team_id) : undefined
        const c = team ? TEAM_COLORS[team.color] : null
        return (
          <section key={stg.id} className={`rounded-2xl border p-3 ${c ? `${c.border} ${c.bg}` : 'border-cream-300'}`}>
            <h3 className={`mb-2 font-bold ${c?.text ?? 'text-olive-800'}`}>
              {stg.position + 1}. {stg.label} {team && `— ${team.name}`}
            </h3>
            <div className="space-y-3">{items.map((p) => render(p, 0))}</div>
          </section>
        )
      })}
      {posts.some((p) => !p.stage_id) && (
        <section className="rounded-2xl border border-cream-300 p-3">
          <h3 className="mb-2 font-bold text-olive-800">مشاركات وأسئلة عامة</h3>
          <div className="space-y-3">{posts.filter((p) => !p.stage_id).map((p) => render(p, 0))}</div>
        </section>
      )}
    </div>
  )
}

function DebateBanner({ data, teams }: { data: StudentState; teams: Map<string, Team> }) {
  const stages = data.stages ?? []
  const cur = stages.find((x) => x.id === data.session.current_stage_id)
  return (
    <section className="card mb-4 p-4" aria-label="مراحل المناظرة">
      <h2 className="mb-2 font-bold text-olive-800">المناظرة</h2>
      <ol className="flex flex-wrap gap-2">
        {stages.map((stg) => {
          const t = stg.team_id ? teams.get(stg.team_id) : undefined
          const active = stg.id === cur?.id
          return (
            <li key={stg.id} className={`chip border px-3 py-1 text-sm ${active ? 'border-olive-600 bg-olive-700 text-cream-50' : 'border-cream-300 bg-cream-50 text-muted'}`} aria-current={active ? 'step' : undefined}>
              {stg.position + 1}. {stg.label}
              {t && ` (${t.name})`}
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-sm">
        {cur ? (
          <>
            المرحلة الحالية: <strong>{cur.label}</strong>
            {cur.team_id ? <> — الكلمة لـ<strong>{teams.get(cur.team_id)?.name}</strong></> : ' — يديرها المعلم'}
            {cur.max_posts_per_team > 0 && ` · حتى ${cur.max_posts_per_team} مشاركات للفريق`}
          </>
        ) : (
          'لم يفتح المعلم أي مرحلة بعد.'
        )}
      </p>
    </section>
  )
}

function TurnsPanel({
  data,
  myQueue,
  waitingAhead,
  speaker,
  onRaise,
  enabled,
  prominent,
}: {
  data: StudentState
  myQueue: NonNullable<StudentState['queue']>[number] | undefined
  waitingAhead: number
  speaker: NonNullable<StudentState['queue']>[number] | undefined
  onRaise: () => void
  enabled: boolean
  prominent: boolean
}) {
  const [busy, setBusy] = useState(false)
  const waiting = (data.queue ?? []).filter((q) => q.status === 'waiting')
  const iAmSpeaker = speaker?.member_id === data.me.id
  return (
    <section className={`card mb-4 p-4 ${iAmSpeaker ? 'ring-2 ring-gold-400' : ''}`} aria-label="طلب الحديث">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-olive-800">{prominent ? 'النقاش بالدور' : 'طلب الحديث'}</h2>
          <p className="text-sm" aria-live="polite">
            {iAmSpeaker ? (
              <strong className="text-gold-700">الدور لك الآن. تحدّث أو اكتب مداخلتك قبل انتهاء الوقت.</strong>
            ) : speaker ? (
              <>المتحدث الآن: <strong>{speaker.name}</strong></>
            ) : (
              'لا يوجد متحدث الآن.'
            )}
            {myQueue?.status === 'waiting' && <> · ترتيبك في الانتظار: <strong>{waitingAhead + 1}</strong></>}
          </p>
        </div>
        {!iAmSpeaker && (
          <button
            type="button"
            className={myQueue?.status === 'waiting' ? 'btn-ghost' : 'btn-gold'}
            disabled={!enabled || busy}
            onClick={async () => {
              setBusy(true)
              await onRaise()
              setBusy(false)
            }}
          >
            {myQueue?.status === 'waiting' ? 'إلغاء طلب الحديث' : '✋ أطلب الحديث'}
          </button>
        )}
      </div>
      {prominent && waiting.length > 0 && (
        <ol className="mt-3 flex flex-wrap gap-2 text-sm">
          {waiting.map((q, i) => (
            <li key={q.id} className={`chip border px-3 py-1 ${q.member_id === data.me.id ? 'border-gold-400 bg-gold-50 font-bold' : 'border-cream-300 bg-cream-50'}`}>
              {i + 1}. {q.name}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function People({ data, teams }: { data: StudentState; teams: Map<string, Team> }) {
  const members = data.members ?? []
  const groups: { title: string; color?: string; list: typeof members }[] =
    teams.size > 0
      ? [
          ...[...teams.values()].map((t) => ({ title: t.name, color: t.color, list: members.filter((m) => m.team_id === t.id) })),
          { title: 'بلا فريق', list: members.filter((m) => !m.team_id) },
        ].filter((g) => g.list.length > 0)
      : [{ title: 'المشاركون', list: members }]
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.title} className="card p-4">
          <h2 className="mb-2 font-bold text-olive-800">
            {g.title} ({g.list.length})
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {g.list.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg bg-cream-100 px-3 py-2">
                <span className={`h-2.5 w-2.5 rounded-full ${m.online ? 'bg-olive-500' : 'bg-stone-300'}`} title={m.online ? 'متصل' : 'غير متصل'} aria-hidden="true" />
                <span className="font-semibold">{m.display_name}</span>
                {m.role_label && <Badge className="bg-gold-100 text-gold-700">{m.role_label}</Badge>}
                <span className="sr-only">{m.online ? 'متصل' : 'غير متصل'}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
