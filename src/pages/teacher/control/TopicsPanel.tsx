import { useState } from 'react'
import { Badge, ConfirmButton } from '../../../components/ui'
import { teacherApi } from '../../../lib/api'
import type { TeacherState } from '../../../lib/api/types'
import type { PanelProps } from './types'

type T = TeacherState['topics'][number]

export function TopicsPanel({ data, act, busy }: PanelProps) {
  const s = data.session
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const count = (id: string) => data.posts.filter((p) => p.topic_id === id && !p.parent_id).length

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="space-y-2" aria-label="المحاور">
        <p className="text-sm text-muted">المحاور الفرعية تساعد الطلاب على ربط مشاركاتهم بجانب محدد من السؤال. يرى الطلاب المحاور المفعّلة فقط.</p>
        {data.topics.length === 0 && <p className="text-muted">لا توجد محاور فرعية. النقاش يدور حول السؤال المحوري فقط.</p>}
        {data.topics.map((t) => (
          <TopicRow key={t.id} t={t} posts={count(t.id)} act={act} sessionId={s.id} />
        ))}
      </section>
      <aside>
        <form
          className="card space-y-3 p-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await act('topic', () => teacherApi.saveTopic(s.id, null, title.trim(), body.trim()), 'أُضيف المحور')
            if (r) {
              setTitle('')
              setBody('')
            }
          }}
        >
          <h2 className="font-bold text-olive-800">محور جديد</h2>
          <input className="input" placeholder="عنوان المحور" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} aria-label="عنوان المحور" required />
          <textarea className="input" rows={3} placeholder="توضيح اختياري" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} aria-label="توضيح المحور" />
          <button className="btn-primary" disabled={!title.trim() || busy === 'topic'}>
            إضافة
          </button>
        </form>
      </aside>
    </div>
  )
}

function TopicRow({ t, posts, act, sessionId }: { t: T; posts: number; act: PanelProps['act']; sessionId: string }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(t.title)
  const [body, setBody] = useState(t.body)
  return (
    <div className={`card p-3 ${t.is_active ? '' : 'opacity-70'}`}>
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await act('topic', () => teacherApi.saveTopic(sessionId, t.id, title.trim(), body.trim()), 'حُفظ المحور')
            if (r !== undefined) setEditing(false)
          }}
        >
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} aria-label="عنوان المحور" required />
          <textarea className="input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} aria-label="توضيح المحور" />
          <div className="flex gap-2">
            <button className="btn-primary btn-sm">حفظ</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
              إلغاء
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-olive-900">
              {t.title} {!t.is_active && <Badge className="bg-stone-200 text-stone-700">مخفي عن الطلاب</Badge>}
            </p>
            {t.body && <p className="text-sm text-muted">{t.body}</p>}
            <p className="text-xs text-muted">مشاركات مرتبطة: {posts}</p>
          </div>
          <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
            تعديل
          </button>
          <button className="btn-ghost btn-sm" onClick={() => act('topic', () => teacherApi.topicAction(t.id, t.is_active ? 'deactivate' : 'activate'))}>
            {t.is_active ? 'إخفاء' : 'إظهار'}
          </button>
          <ConfirmButton confirmText="حذف المحور؟ تبقى المشاركات المرتبطة به لكن بلا محور." onConfirm={async () => void (await act('topic', () => teacherApi.topicAction(t.id, 'delete'), 'حُذف المحور'))}>
            حذف
          </ConfirmButton>
        </div>
      )}
    </div>
  )
}
