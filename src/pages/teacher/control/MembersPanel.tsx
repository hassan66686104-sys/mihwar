import { useState } from 'react'
import { Badge, ConfirmButton, Modal } from '../../../components/ui'
import { teacherApi } from '../../../lib/api'
import type { TeacherMember } from '../../../lib/api/types'
import { TEAM_COLORS, fmtTime } from '../../../lib/labels'
import type { PanelProps } from './types'

const ROLES = ['ملخِّص', 'مدير الوقت', 'مسجّل الأدلة', 'مقرّر الفريق', 'متحدث الفريق']

export function MembersPanel({ data, act, busy }: PanelProps) {
  const s = data.session
  const [roleFor, setRoleFor] = useState<TeacherMember | null>(null)
  const [role, setRole] = useState('')
  const pending = data.members.filter((m) => m.status === 'pending')
  const active = data.members.filter((m) => m.status === 'active')
  const revoked = data.members.filter((m) => m.status === 'revoked')
  const team = (id: string | null) => data.teams.find((t) => t.id === id)

  const row = (m: TeacherMember) => {
    const t = team(m.team_id)
    return (
      <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream-100 px-3 py-2">
        <span className={`h-2.5 w-2.5 rounded-full ${m.online ? 'bg-olive-500' : 'bg-stone-300'}`} title={m.online ? 'متصل الآن' : 'غير متصل'} aria-label={m.online ? 'متصل الآن' : 'غير متصل'} />
        <span className="min-w-32 flex-1 font-semibold">
          {m.display_name}
          {m.role_label && <Badge className="ms-2 bg-gold-100 text-gold-700">{m.role_label}</Badge>}
          {t && <Badge className={`ms-2 ${TEAM_COLORS[t.color].bg} ${TEAM_COLORS[t.color].text}`}>{t.name}</Badge>}
        </span>
        <span className="text-xs text-muted">
          مشاركات {m.post_count} · ردود {m.reply_count}
          {s.settings.points_enabled && ` · نقاط ${m.points}`} · آخر ظهور {fmtTime(m.last_seen_at)}
        </span>
        {m.status === 'pending' && (
          <>
            <button className="btn-primary btn-sm" disabled={busy === 'mem'} onClick={() => act('mem', () => teacherApi.memberAction(m.id, 'approve'), `اعتُمد ${m.display_name}`)}>
              اعتماد
            </button>
            <button className="btn-ghost btn-sm" onClick={() => act('mem', () => teacherApi.memberAction(m.id, 'revoke'), 'رُفض الدخول')}>
              رفض
            </button>
          </>
        )}
        {m.status === 'active' && (
          <>
            {s.settings.points_enabled && (
              <>
                <button className="btn-ghost btn-sm" aria-label={`إضافة نقطة لـ ${m.display_name}`} onClick={() => act('pt', () => teacherApi.addPoints(m.id, 1, 'تقدير المعلم'), '+1 نقطة')}>
                  +1
                </button>
                <button className="btn-ghost btn-sm" aria-label={`خصم نقطة من ${m.display_name}`} onClick={() => act('pt', () => teacherApi.addPoints(m.id, -1, 'خصم'), '−1 نقطة')}>
                  −1
                </button>
              </>
            )}
            <button
              className="btn-ghost btn-sm"
              onClick={() => {
                setRoleFor(m)
                setRole(m.role_label ?? '')
              }}
            >
              تكليف بدور
            </button>
            <ConfirmButton confirmText={`إخراج ${m.display_name} من الجلسة؟ يُلغى دخوله فورًا ولا يستطيع الإرسال، ويمكنك إعادته لاحقًا.`} onConfirm={async () => void (await act('mem', () => teacherApi.memberAction(m.id, 'revoke'), 'أُخرج الطالب'))}>
              إخراج
            </ConfirmButton>
          </>
        )}
        {m.status === 'revoked' && (
          <button className="btn-ghost btn-sm" onClick={() => act('mem', () => teacherApi.memberAction(m.id, 'restore'), 'أُعيد الطالب')}>
            إعادة
          </button>
        )}
      </li>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {pending.length > 0 && (
          <section className="card border-gold-300 p-4" aria-label="بانتظار الاعتماد">
            <h2 className="mb-2 font-bold text-gold-700">بانتظار الاعتماد ({pending.length})</h2>
            <p className="mb-2 text-xs text-muted">تأكد أن الاسم لطالب حاضر في الصف قبل اعتماده.</p>
            <ul className="space-y-2">{pending.map(row)}</ul>
          </section>
        )}
        <section className="card p-4" aria-label="المشاركون">
          <h2 className="mb-2 font-bold text-olive-800">
            المشاركون ({active.length}) · متصلون الآن {active.filter((m) => m.online).length}
          </h2>
          {active.length === 0 ? <p className="text-muted">لم يدخل أي طالب بعد.</p> : <ul className="space-y-2">{active.map(row)}</ul>}
        </section>
        {revoked.length > 0 && (
          <section className="card p-4" aria-label="المُخرَجون">
            <h2 className="mb-2 font-bold text-muted">أُخرجوا أو رُفض دخولهم ({revoked.length})</h2>
            <ul className="space-y-2">{revoked.map(row)}</ul>
          </section>
        )}
      </div>
      <aside className="space-y-4">
        <section className="card p-4" aria-label="لم يدخلوا">
          <h2 className="mb-2 font-bold text-olive-800">من قائمة الصف ولم يدخلوا ({data.not_joined.length})</h2>
          {s.class_id ? (
            data.not_joined.length ? (
              <ul className="space-y-1 text-sm">
                {data.not_joined.map((n) => (
                  <li key={n.id}>{n.full_name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">دخل جميع طلاب الصف.</p>
            )
          ) : (
            <p className="text-sm text-muted">الجلسة غير مرتبطة بصف، لذلك لا توجد قائمة مقارنة.</p>
          )}
        </section>
        <p className="text-xs text-muted">«متصل الآن» يعني أن جهاز الطالب أرسل إشارة خلال آخر دقيقة تقريبًا؛ قد يتأخر التحديث بضع ثوانٍ.</p>
      </aside>

      <Modal open={!!roleFor} onClose={() => setRoleFor(null)} title={`تكليف ${roleFor?.display_name ?? ''} بدور`}>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (roleFor) await act('mem', () => teacherApi.memberAction(roleFor.id, 'role', role.trim() || null), role.trim() ? 'حُفظ الدور' : 'أُزيل الدور')
            setRoleFor(null)
          }}
        >
          <div className="flex flex-wrap gap-1">
            {ROLES.map((r) => (
              <button key={r} type="button" className={`chip px-3 py-1 text-sm ${role === r ? 'bg-olive-700 text-cream-50' : 'bg-cream-200 text-olive-800'}`} onClick={() => setRole(r)}>
                {r}
              </button>
            ))}
          </div>
          <input className="input" value={role} maxLength={40} onChange={(e) => setRole(e.target.value)} aria-label="الدور" placeholder="أو اكتب دورًا آخر" />
          <div className="flex gap-2">
            <button className="btn-primary">حفظ</button>
            {roleFor?.role_label && (
              <button type="button" className="btn-ghost" onClick={() => setRole('')}>
                إزالة الدور
              </button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  )
}
