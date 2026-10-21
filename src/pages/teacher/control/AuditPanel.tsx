import type { AuditEntry, TeacherState } from '../../../lib/api/types'
import { AUDIT_LABELS, STATUS_LABELS, MODE_LABELS, fmtDateTime } from '../../../lib/labels'

function details(a: AuditEntry): string {
  const d = a.details ?? {}
  const parts: string[] = []
  const str = (k: string) => (typeof d[k] === 'string' || typeof d[k] === 'number' ? String(d[k]) : null)
  if (str('from') && str('to')) {
    const map = a.action === 'status_change' ? (STATUS_LABELS as Record<string, string>) : a.action === 'mode_change' ? (MODE_LABELS as Record<string, string>) : {}
    parts.push(`${map[str('from')!] ?? str('from')} ← ${map[str('to')!] ?? str('to')}`)
  }
  for (const k of ['name', 'member', 'student', 'question', 'label', 'role', 'title', 'stage', 'value', 'scope', 'reason']) if (str(k)) parts.push(str(k)!)
  if (str('delta')) parts.push(`${Number(d.delta) > 0 ? '+' : ''}${str('delta')}`)
  if (str('seconds')) parts.push(`${str('seconds')} ث`)
  if (str('count')) parts.push(`العدد: ${str('count')}`)
  return parts.join(' · ')
}

export function AuditPanel({ data }: { data: TeacherState }) {
  return (
    <section className="card p-4" aria-label="سجل الإجراءات">
      <h2 className="mb-1 font-bold text-olive-800">سجل الإجراءات</h2>
      <p className="mb-3 text-xs text-muted">يُسجَّل تلقائيًا على الخادم ولا يمكن تعديله من الواجهة. يظهر هنا آخر 50 إجراءً.</p>
      {data.audit.length === 0 ? (
        <p className="text-muted">لا توجد إجراءات مسجلة بعد.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted">
              <tr className="border-b border-cream-300">
                <th className="py-2 text-start font-semibold">الوقت</th>
                <th className="py-2 text-start font-semibold">المنفّذ</th>
                <th className="py-2 text-start font-semibold">الإجراء</th>
                <th className="py-2 text-start font-semibold">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {data.audit.map((a, i) => (
                <tr key={i} className="border-b border-cream-200">
                  <td className="whitespace-nowrap py-2 pe-3">{fmtDateTime(a.created_at)}</td>
                  <td className="py-2 pe-3">{a.actor_name}</td>
                  <td className="py-2 pe-3">{AUDIT_LABELS[a.action] ?? a.action}</td>
                  <td className="py-2 text-muted">{details(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
