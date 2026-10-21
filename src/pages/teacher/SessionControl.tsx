import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Alert, Badge, ConnectionBadge, DemoBanner, OfflineBar, PageLoader, useAction } from '../../components/ui'
import { TimerDisplay } from '../../components/TimerDisplay'
import { teacherApi } from '../../lib/api'
import type { TeacherState } from '../../lib/api/types'
import { MODE_LABELS, STATUS_LABELS, STATUS_STYLES } from '../../lib/labels'
import { serverNow, useLiveState } from '../../lib/useLiveState'
import { AuditPanel } from './control/AuditPanel'
import { DebatePanel } from './control/DebatePanel'
import { MembersPanel } from './control/MembersPanel'
import { Overview } from './control/Overview'
import { PollsPanel } from './control/PollsPanel'
import { PostsPanel } from './control/PostsPanel'
import { QueuePanel } from './control/QueuePanel'
import { TopicsPanel } from './control/TopicsPanel'
import type { Act } from './control/types'

type Tab = 'overview' | 'posts' | 'queue' | 'debate' | 'polls' | 'members' | 'topics' | 'audit'

export default function SessionControl() {
  const { id = '' } = useParams()
  const fetcher = useCallback(() => teacherApi.state(id), [id])
  const { data, error, connection, refresh, serverOffset } = useLiveState<TeacherState>(id, fetcher, { pollMs: 20000 })
  const { busy, run } = useAction()
  const [tab, setTab] = useState<Tab>('overview')
  const ticked = useRef<string | null>(null)

  const act: Act = useCallback(
    async (key, fn, success) => {
      const r = await run(key, fn, success)
      void refresh()
      return r
    },
    [run, refresh],
  )

  // عند انتهاء وقت المتحدث: يطلب جهاز المعلم من الخادم تطبيق إعداد «نقل الدور» أو «إغلاق الإرسال»
  const speaker = data?.queue.find((q) => q.status === 'speaking')
  useEffect(() => {
    if (!speaker?.ends_at) return
    const due = new Date(speaker.ends_at).getTime() - serverNow(serverOffset)
    const t = setTimeout(
      () => {
        if (ticked.current === speaker.id + speaker.ends_at) return
        ticked.current = speaker.id + speaker.ends_at
        void teacherApi.queueTick(id).then(() => refresh()).catch(() => {})
      },
      Math.max(0, due + 300),
    )
    return () => clearTimeout(t)
  }, [speaker?.id, speaker?.ends_at, id, refresh, serverOffset])

  if (!data) return error ? <Alert tone="error">{error.message}</Alert> : <PageLoader label="جارٍ تحميل الجلسة…" />
  const s = data.session
  const pending = data.posts.filter((p) => p.status === 'pending').length
  const pendingMembers = data.members.filter((m) => m.status === 'pending').length
  const waiting = data.queue.filter((q) => q.status === 'waiting').length

  const tabs: [Tab, string][] = [
    ['overview', 'التحكم'],
    ['posts', `المشاركات${pending ? ` (${pending} للمراجعة)` : ''}`],
    ['queue', `الدور${waiting ? ` (${waiting})` : ''}`],
    ['debate', 'الفرق والمناظرة'],
    ['polls', 'التصويت'],
    ['members', `المشاركون${pendingMembers ? ` (${pendingMembers} بانتظار الاعتماد)` : ''}`],
    ['topics', 'المحاور'],
    ['audit', 'سجل الإجراءات'],
  ]

  return (
    <div className="space-y-4">
      <OfflineBar connection={connection} />
      {s.is_demo && <DemoBanner />}
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <Link to="/teacher" className="text-sm text-muted hover:underline">
            ← لوحة التحكم
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold text-olive-800">{s.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <Badge className={STATUS_STYLES[s.status]}>{STATUS_LABELS[s.status]}</Badge>
            <Badge className="bg-cream-200 text-olive-800">{MODE_LABELS[s.mode]}</Badge>
            <span className="text-muted">
              {s.class_name ?? 'بلا صف'} · المشاركون {data.members.filter((m) => m.status === 'active').length}
              {s.invited_count > 0 && ` من ${s.invited_count}`} · متصلون الآن {data.members.filter((m) => m.online).length}
            </span>
            <ConnectionBadge connection={connection} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TimerDisplay timer={data.timers.session} offset={serverOffset} label="وقت الجلسة" size="sm" />
          <Link to={`/teacher/s/${id}/present`} className="btn-gold btn-sm" target="_blank" rel="noopener">
            وضع العرض ⛶
          </Link>
          <Link to={`/teacher/s/${id}/report`} className="btn-ghost btn-sm">
            التقرير
          </Link>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-cream-200 p-1" aria-label="أقسام إدارة الجلسة">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-10 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${tab === k ? 'bg-cream-50 text-olive-800 shadow' : 'text-muted hover:text-olive-800'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview data={data} act={act} busy={busy} offset={serverOffset} />}
      {tab === 'posts' && <PostsPanel data={data} act={act} busy={busy} />}
      {tab === 'queue' && <QueuePanel data={data} act={act} busy={busy} offset={serverOffset} />}
      {tab === 'debate' && <DebatePanel data={data} act={act} busy={busy} offset={serverOffset} />}
      {tab === 'polls' && <PollsPanel data={data} act={act} busy={busy} />}
      {tab === 'members' && <MembersPanel data={data} act={act} busy={busy} />}
      {tab === 'topics' && <TopicsPanel data={data} act={act} busy={busy} />}
      {tab === 'audit' && <AuditPanel data={data} />}
    </div>
  )
}
