import { useMemo, useState } from 'react'
import { PostCard } from '../../../components/PostCard'
import { ConfirmButton, Modal, useToast } from '../../../components/ui'
import { teacherApi } from '../../../lib/api'
import { toAppError } from '../../../lib/api/errors'
import type { Post, PostKind, TeacherTag, Team } from '../../../lib/api/types'
import { KIND_LABELS, TAG_LABELS } from '../../../lib/labels'
import { uuid } from '../../../lib/storage'
import type { PanelProps } from './types'

type Filter = 'pending' | 'all' | 'approved' | 'rejected' | 'evidence' | 'questions'

export function PostsPanel({ data, act }: PanelProps) {
  const toast = useToast()
  const s = data.session
  const [filter, setFilter] = useState<Filter>(data.posts.some((p) => p.status === 'pending') ? 'pending' : 'all')
  const [noteFor, setNoteFor] = useState<Post | null>(null)
  const [note, setNote] = useState('')
  const [replyTo, setReplyTo] = useState<Post | null>(null)
  const [older, setOlder] = useState<Post[]>([])
  const teams = new Map<string, Team>(data.teams.map((t) => [t.id, t]))
  const all = useMemo(() => {
    const ids = new Set(data.posts.map((p) => p.id))
    return [...data.posts, ...older.filter((p) => !ids.has(p.id))]
  }, [data.posts, older])
  const byId = new Map(all.map((p) => [p.id, p]))

  const list = all.filter((p) => {
    if (filter === 'pending') return p.status === 'pending'
    if (filter === 'approved') return p.status === 'approved'
    if (filter === 'rejected') return p.status === 'rejected'
    if (filter === 'evidence') return !!p.evidence
    if (filter === 'questions') return p.kind === 'question'
    return true
  })

  const counts: Record<Filter, number> = {
    pending: all.filter((p) => p.status === 'pending').length,
    all: all.length,
    approved: all.filter((p) => p.status === 'approved').length,
    rejected: all.filter((p) => p.status === 'rejected').length,
    evidence: all.filter((p) => p.evidence).length,
    questions: all.filter((p) => p.kind === 'question').length,
  }
  const labels: Record<Filter, string> = { pending: 'بانتظار المراجعة', all: 'الكل', approved: 'المقبولة', rejected: 'المرفوضة', evidence: 'بأدلة', questions: 'الأسئلة' }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="تصفية المشاركات">
          {(Object.keys(labels) as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`chip px-3 py-1 text-sm ${filter === f ? 'bg-olive-700 text-cream-50' : 'bg-cream-200 text-olive-800'}`}>
              {labels[f]} ({counts[f]})
            </button>
          ))}
        </div>
        {list.length === 0 && <p className="text-muted">لا توجد مشاركات في هذا التصنيف.</p>}
        {list.map((p) => {
          const parent = p.parent_id ? byId.get(p.parent_id) : null
          return (
            <div key={p.id}>
              {parent && <p className="mb-1 truncate text-xs text-muted">↩︎ ردًا على {parent.author_name}: {parent.body}</p>}
              <PostCard
                post={p}
                teacherView
                team={p.team_id ? teams.get(p.team_id) : undefined}
                actions={
                  <>
                    {p.status !== 'approved' && (
                      <button className="btn-primary btn-sm" onClick={() => act('m', () => teacherApi.moderate(p.id, 'approve'), 'قُبلت المشاركة')}>
                        قبول
                      </button>
                    )}
                    {p.status !== 'rejected' && !p.is_teacher && (
                      <button className="btn-ghost btn-sm" onClick={() => act('m', () => teacherApi.moderate(p.id, 'reject'), 'رُفضت المشاركة وأُخفيت عن الطلاب')}>
                        رفض
                      </button>
                    )}
                    {p.status === 'approved' && !p.parent_id && (
                      <button className="btn-ghost btn-sm" onClick={() => act('m', () => teacherApi.moderate(p.id, p.pinned ? 'unpin' : 'pin'))}>
                        {p.pinned ? 'إلغاء التثبيت' : '📌 تثبيت'}
                      </button>
                    )}
                    <button className="btn-ghost btn-sm" onClick={() => act('m', () => teacherApi.moderate(p.id, p.replies_locked ? 'unlock' : 'lock'))}>
                      {p.replies_locked ? 'فتح الردود' : '🔒 إغلاق الردود'}
                    </button>
                    {!p.is_teacher && (
                      <select
                        className="input w-auto py-1 text-sm"
                        aria-label="تصنيف المعلم"
                        value={p.teacher_tag ?? ''}
                        onChange={(e) => act('m', () => teacherApi.tag(p.id, (e.target.value || null) as TeacherTag | null))}
                      >
                        <option value="">تصنيف المعلم…</option>
                        {(Object.keys(TAG_LABELS) as TeacherTag[]).map((t) => (
                          <option key={t} value={t}>
                            {TAG_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => {
                        setNoteFor(p)
                        setNote(p.teacher_note ?? '')
                      }}
                    >
                      ملاحظة تقييم
                    </button>
                    {s.settings.points_enabled && p.member_id && (
                      <>
                        <button className="btn-ghost btn-sm" onClick={() => act('pt', () => teacherApi.addPoints(p.member_id!, 1, 'مشاركة', p.id), '+1 نقطة')}>
                          +1
                        </button>
                        <button className="btn-ghost btn-sm" onClick={() => act('pt', () => teacherApi.addPoints(p.member_id!, -1, 'خصم', p.id), '−1 نقطة')}>
                          −1
                        </button>
                      </>
                    )}
                    {p.status === 'approved' && (
                      <button className="btn-ghost btn-sm" onClick={() => setReplyTo(p)}>
                        رد المعلم
                      </button>
                    )}
                    <ConfirmButton confirmText="حذف المشاركة نهائيًا مع ردودها؟ يُسجَّل الحذف في سجل الإجراءات." onConfirm={async () => void (await act('m', () => teacherApi.moderate(p.id, 'delete'), 'حُذفت المشاركة'))}>
                      حذف
                    </ConfirmButton>
                  </>
                }
              />
            </div>
          )
        })}
        {data.post_total > all.length && (
          <button
            className="btn-ghost w-full"
            onClick={async () => {
              try {
                const last = all[all.length - 1]
                const more = await teacherApi.postsBefore(s.id, last.created_at)
                setOlder((o) => [...o, ...more])
              } catch (e) {
                toast('error', toAppError(e).message)
              }
            }}
          >
            تحميل مشاركات أقدم
          </button>
        )}
      </div>

      <aside>
        <section className="card sticky top-4 p-4">
          <h2 className="mb-2 font-bold text-olive-800">مشاركة من المعلم</h2>
          <TeacherComposer sessionId={s.id} parent={null} onDone={() => {}} act={act} />
          <p className="mt-2 text-xs text-muted">مثل: خلاصة مرحلية، أو توضيح، أو سؤال توجيهي. تظهر فورًا بشارة «المعلم».</p>
        </section>
      </aside>

      <Modal open={!!noteFor} onClose={() => setNoteFor(null)} title="ملاحظة تقييم (لا يراها الطلاب)">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (noteFor) await act('note', () => teacherApi.moderate(noteFor.id, 'note', note), 'حُفظت الملاحظة')
            setNoteFor(null)
          }}
        >
          <textarea className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-label="الملاحظة" />
          <button className="btn-primary">حفظ</button>
        </form>
      </Modal>
      <Modal open={!!replyTo} onClose={() => setReplyTo(null)} title={`رد المعلم على ${replyTo?.author_name ?? ''}`}>
        {replyTo && <TeacherComposer sessionId={s.id} parent={replyTo} onDone={() => setReplyTo(null)} act={act} />}
      </Modal>
    </div>
  )
}

function TeacherComposer({ sessionId, parent, onDone, act }: { sessionId: string; parent: Post | null; onDone: () => void; act: PanelProps['act'] }) {
  const [kind, setKind] = useState<PostKind>(parent ? 'rebuttal' : 'summary')
  const [body, setBody] = useState('')
  const [clientId, setClientId] = useState(uuid)
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const r = await act('tpost', () => teacherApi.teacherPost(sessionId, kind, body.trim(), parent?.id ?? null, clientId), 'نُشرت مشاركتك')
        if (r) {
          setBody('')
          setClientId(uuid())
          onDone()
        }
      }}
    >
      <select className="input" value={kind} onChange={(e) => setKind(e.target.value as PostKind)} aria-label="نوع المشاركة">
        {(['summary', 'question', 'opinion', 'rebuttal', 'quran', 'hadith', 'example'] as PostKind[]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>
      <textarea className="input" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} aria-label="النص" />
      <button className="btn-primary" disabled={!body.trim()}>
        نشر
      </button>
    </form>
  )
}
