import type { ReactNode } from 'react'
import type { Evidence, Post, Team } from '../lib/api/types'
import { KIND_SHORT, TAG_LABELS, TAG_STYLES, TEAM_COLORS, fmtTime } from '../lib/labels'
import { Badge } from './ui'

export function EvidenceView({ e }: { e: Evidence }) {
  const meta: string[] = []
  if (e.surah) meta.push(`سورة ${e.surah}${e.ayah ? ` : ${e.ayah}` : ''}`)
  if (e.hadith_source) meta.push(`المصدر: ${e.hadith_source}`)
  if (e.hadith_grade) meta.push(`الدرجة كما ذكرها الطالب: ${e.hadith_grade}`)
  if (e.book_title) meta.push(`${e.book_title}${e.page ? ` — ص ${e.page}` : ''}`)
  return (
    <div className="mt-3 rounded-xl border border-gold-200 bg-gold-50/60 p-3 text-sm">
      {e.quote && <blockquote className="font-semibold leading-8 text-olive-900">{e.quote}</blockquote>}
      {meta.length > 0 && <p className="mt-1 text-xs text-gold-700">{meta.join(' · ')}</p>}
      {e.reasoning && (
        <p className="mt-2">
          <span className="font-semibold text-olive-800">وجه الاستدلال: </span>
          {e.reasoning}
        </p>
      )}
      {e.url && (
        <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-block text-xs text-olive-700 underline" dir="ltr">
          {e.url}
        </a>
      )}
    </div>
  )
}

interface Props {
  post: Post
  team?: Team
  depth?: number
  actions?: ReactNode
  teacherView?: boolean
  children?: ReactNode
}

export function PostCard({ post, team, depth = 0, actions, teacherView = false, children }: Props) {
  const tc = team ? TEAM_COLORS[team.color] : null
  const statusNote =
    post.status === 'pending' ? (
      <Badge className="bg-gold-100 text-gold-700">بانتظار مراجعة المعلم</Badge>
    ) : post.status === 'rejected' ? (
      <Badge className="bg-red-100 text-red-800">{teacherView ? 'مرفوضة' : 'لم تُعتمد (لا يراها زملاؤك)'}</Badge>
    ) : null
  return (
    <article
      className={`rounded-2xl border p-4 ${
        post.is_teacher ? 'border-olive-300 bg-olive-50' : post.pinned ? 'border-gold-300 bg-gold-50/40' : 'border-cream-300 bg-cream-50'
      } ${depth > 0 ? 'mt-3' : ''}`}
      aria-label={`مشاركة من ${post.author_name}`}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-bold text-olive-900">{post.author_name}</span>
        {post.is_teacher && <Badge className="bg-olive-700 text-cream-50">المعلم</Badge>}
        {team && tc && (
          <Badge className={`${tc.bg} ${tc.text} border ${tc.border}`}>
            <span className={`h-2 w-2 rounded-full ${tc.dot}`} aria-hidden="true" />
            {team.name}
          </Badge>
        )}
        <Badge className="bg-cream-200 text-olive-800">{KIND_SHORT[post.kind]}</Badge>
        {post.evidence && <Badge className="bg-gold-100 text-gold-700">📎 مرفق دليل</Badge>}
        {post.pinned && <Badge className="bg-gold-200 text-olive-900">📌 مثبّتة</Badge>}
        {post.teacher_tag && <Badge className={TAG_STYLES[post.teacher_tag]}>{TAG_LABELS[post.teacher_tag]}</Badge>}
        {statusNote}
        <time className="ms-auto text-xs text-muted" dateTime={post.created_at}>
          {fmtTime(post.created_at)}
          {post.edited_at && ' · عُدِّلت'}
        </time>
      </header>
      <p className="mt-2 whitespace-pre-wrap break-words leading-8">{post.body}</p>
      {post.evidence && <EvidenceView e={post.evidence} />}
      {teacherView && post.teacher_note && <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-muted">ملاحظة المعلم: {post.teacher_note}</p>}
      {post.replies_locked && <p className="mt-2 text-xs font-semibold text-muted">🔒 الردود مغلقة على هذه المشاركة</p>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      {children && <div className="border-s-2 border-cream-300 ps-3 sm:ps-4">{children}</div>}
    </article>
  )
}

/** يبني شجرة الردود: كل رد مرتبط بمشاركته الأصلية */
export function buildThreads(posts: Post[]) {
  const byParent = new Map<string, Post[]>()
  const roots: Post[] = []
  const ids = new Set(posts.map((p) => p.id))
  for (const p of posts) {
    if (p.parent_id && ids.has(p.parent_id)) {
      const list = byParent.get(p.parent_id) ?? []
      list.push(p)
      byParent.set(p.parent_id, list)
    } else if (!p.parent_id) {
      roots.push(p)
    }
  }
  for (const list of byParent.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return { roots, childrenOf: (id: string) => byParent.get(id) ?? [] }
}

/** عدد التفاعلات (الردود المتداخلة) لفرز «الأكثر تفاعلًا» — ليس معيارًا لصحة الرأي */
export function interactionCount(id: string, childrenOf: (id: string) => Post[]): number {
  return childrenOf(id).reduce((n, c) => n + 1 + interactionCount(c.id, childrenOf), 0)
}
