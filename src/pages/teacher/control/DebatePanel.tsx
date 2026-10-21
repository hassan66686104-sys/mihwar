import { useState } from 'react'
import { ConfirmButton } from '../../../components/ui'
import { teacherApi } from '../../../lib/api'
import type { Stage, TeamColor } from '../../../lib/api/types'
import { TEAM_COLORS } from '../../../lib/labels'
import { TimerControls } from './Overview'
import type { TimedPanelProps } from './types'

const COLORS: TeamColor[] = ['olive', 'gold', 'teal', 'rose', 'slate', 'sky']

export function DebatePanel({ data, act, busy, offset }: TimedPanelProps) {
  const s = data.session
  const [newTeam, setNewTeam] = useState('')
  const [count, setCount] = useState(2)
  const active = data.members.filter((m) => m.status === 'active')
  const current = data.stages.find((x) => x.id === s.current_stage_id)
  const teamName = (id: string | null) => data.teams.find((t) => t.id === id)?.name ?? 'المعلم'

  return (
    <div className="space-y-4">
      <section className="card p-4" aria-label="الفرق">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex-1 font-bold text-olive-800">الفرق</h2>
          <label className="flex items-center gap-1 text-sm">
            توزيع عشوائي متوازن على
            <select className="input w-auto py-1" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            فرق
          </label>
          <ConfirmButton className="btn-ghost btn-sm" confirmText="سيُعاد توزيع كل الطلاب النشطين عشوائيًا، ويُلغى التوزيع الحالي." onConfirm={async () => void (await act('auto', () => teacherApi.autoTeams(s.id, count), 'وُزّع الطلاب'))}>
            توزيع
          </ConfirmButton>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.teams.map((t) => {
            const c = TEAM_COLORS[t.color]
            const members = active.filter((m) => m.team_id === t.id)
            return (
              <div key={t.id} className={`rounded-xl border p-3 ${c.border} ${c.bg}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${c.dot}`} aria-hidden="true" />
                  <input
                    className="input flex-1 py-1 font-bold"
                    defaultValue={t.name}
                    aria-label="اسم الفريق"
                    onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && act('team', () => teacherApi.saveTeam(s.id, t.id, e.target.value.trim(), t.color))}
                  />
                  <select className="input w-auto py-1" value={t.color} aria-label="لون الفريق" onChange={(e) => act('team', () => teacherApi.saveTeam(s.id, t.id, t.name, e.target.value as TeamColor))}>
                    {COLORS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                  <ConfirmButton confirmText={`حذف ${t.name}؟ سيصبح أعضاؤه بلا فريق.`} onConfirm={async () => void (await act('team', () => teacherApi.deleteTeam(t.id)))}>
                    ✕
                  </ConfirmButton>
                </div>
                <ul className="space-y-1 text-sm">
                  {members.map((m) => (
                    <li key={m.id}>{m.display_name}</li>
                  ))}
                  {members.length === 0 && <li className="text-muted">لا أعضاء</li>}
                </ul>
              </div>
            )
          })}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newTeam.trim()) return
            await act('team', () => teacherApi.saveTeam(s.id, null, newTeam.trim(), COLORS[data.teams.length % COLORS.length]))
            setNewTeam('')
          }}
        >
          <input className="input" placeholder="اسم فريق جديد" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} maxLength={40} aria-label="اسم فريق جديد" />
          <button className="btn-ghost">إضافة</button>
        </form>

        <h3 className="mt-5 mb-2 font-bold text-olive-800">تعيين الطلاب يدويًا</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((m) => (
            <label key={m.id} className="flex items-center gap-2 rounded-lg bg-cream-100 px-3 py-2 text-sm">
              <span className="flex-1 font-semibold">{m.display_name}</span>
              <select className="input w-auto py-1" value={m.team_id ?? ''} onChange={(e) => act('assign', () => teacherApi.assignTeam(m.id, e.target.value || null))} aria-label={`فريق ${m.display_name}`}>
                <option value="">بلا فريق</option>
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {active.length === 0 && <p className="text-muted">لم يدخل أي طالب بعد.</p>}
        </div>
      </section>

      <section className="card p-4" aria-label="مراحل المناظرة">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex-1 font-bold text-olive-800">مراحل المناظرة</h2>
          {data.teams.length >= 2 && (
            <ConfirmButton className="btn-ghost btn-sm" confirmText="ستُستبدل المراحل الحالية بالمراحل الافتراضية الخمس." onConfirm={async () => void (await act('stages', () => teacherApi.defaultStages(s.id)))}>
              المراحل الافتراضية
            </ConfirmButton>
          )}
        </div>
        {s.mode !== 'debate' && <p className="mb-2 text-sm text-gold-700">فعّل نمط «المناظرة» من قسم التحكم حتى تُطبَّق قيود المراحل على الطلاب.</p>}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-cream-100 p-3">
          <div className="flex-1">
            <p className="text-sm text-muted">المرحلة الحالية</p>
            <p className="text-lg font-bold text-olive-900">{current ? `${current.label} — ${teamName(current.team_id)}` : 'لم تبدأ'}</p>
          </div>
          <button className="btn-primary" disabled={busy === 'stage' || data.stages.length === 0} onClick={() => act('stage', () => teacherApi.activateStage(s.id, null, true), 'فُتحت المرحلة التالية')}>
            {current ? 'فتح المرحلة التالية' : 'بدء المرحلة الأولى'}
          </button>
          {current && (
            <button className="btn-ghost" onClick={() => act('stage', () => teacherApi.activateStage(s.id, null, false))}>
              إيقاف المراحل
            </button>
          )}
        </div>
        {current && <TimerControls sessionId={s.id} scope="stage" timer={data.timers.stage} offset={offset} act={act} defaultSeconds={current.duration_sec} />}
        <ol className="mt-4 space-y-2">
          {data.stages.map((st) => (
            <StageRow key={st.id} stage={st} data={data} act={act} active={st.id === s.current_stage_id} />
          ))}
        </ol>
        <button
          className="btn-ghost btn-sm mt-3"
          onClick={() => act('stage', () => teacherApi.saveStage(s.id, null, { label: 'مرحلة جديدة', team_id: data.teams[0]?.id ?? null, duration_sec: 120, max_posts_per_team: 2 }))}
        >
          + إضافة مرحلة
        </button>
        <p className="mt-3 text-xs text-muted">
          نقاط الفرق اختيارية: امنحها من «المشاركات» أو «المشاركون» وفق معايير تعلنها للطلاب مسبقًا (مثل: قوة الدليل، الرد على حجة الآخر، الالتزام بالوقت وآداب الحوار).
        </p>
      </section>
    </div>
  )
}

function StageRow({ stage, data, act, active }: { stage: Stage; data: TimedPanelProps['data']; act: TimedPanelProps['act']; active: boolean }) {
  const [f, setF] = useState(stage)
  const dirty = JSON.stringify(f) !== JSON.stringify(stage)
  return (
    <li className={`flex flex-wrap items-end gap-2 rounded-xl border p-3 ${active ? 'border-olive-500 bg-olive-50' : 'border-cream-300'}`}>
      <span className="pb-2 font-bold text-gold-600">{stage.position + 1}</span>
      <label className="min-w-40 flex-1">
        <span className="text-xs text-muted">اسم المرحلة</span>
        <input className="input py-1" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} maxLength={80} />
      </label>
      <label>
        <span className="text-xs text-muted">الفريق</span>
        <select className="input py-1" value={f.team_id ?? ''} onChange={(e) => setF({ ...f, team_id: e.target.value || null })}>
          <option value="">المعلم</option>
          {data.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="text-xs text-muted">المدة (ث)</span>
        <input type="number" min={10} max={3600} className="input w-24 py-1" value={f.duration_sec} onChange={(e) => setF({ ...f, duration_sec: Number(e.target.value) })} />
      </label>
      <label>
        <span className="text-xs text-muted">حد المشاركات</span>
        <input type="number" min={0} max={100} className="input w-20 py-1" value={f.max_posts_per_team} onChange={(e) => setF({ ...f, max_posts_per_team: Number(e.target.value) })} />
      </label>
      {dirty && (
        <button className="btn-primary btn-sm" onClick={() => act('stage', () => teacherApi.saveStage(data.session.id, stage.id, f))}>
          حفظ
        </button>
      )}
      <button className="btn-ghost btn-sm" onClick={() => act('stage', () => teacherApi.activateStage(data.session.id, stage.id))}>
        فتح هذه المرحلة
      </button>
      <ConfirmButton confirmText="حذف المرحلة؟" onConfirm={async () => void (await act('stage', () => teacherApi.deleteStage(stage.id)))}>
        ✕
      </ConfirmButton>
    </li>
  )
}
