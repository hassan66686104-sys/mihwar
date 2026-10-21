import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Badge, ConfirmButton, DemoBanner, Modal, PageLoader, useAction } from '../../components/ui'
import { teacherApi } from '../../lib/api'
import { toAppError } from '../../lib/api/errors'
import type { ClassDetail } from '../../lib/api/types'
import { downloadCsv } from '../../lib/csv'

export default function ClassPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState<ClassDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [names, setNames] = useState('')
  const [showCodes, setShowCodes] = useState(false)
  const [rename, setRename] = useState<string | null>(null)
  const { busy, run } = useAction()

  const load = useCallback(async () => {
    try {
      setData(await teacherApi.classDetail(id))
    } catch (e) {
      setError(toAppError(e).message)
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load])

  if (!data) return error ? <Alert tone="error">{error}</Alert> : <PageLoader />

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const list = names
      .split(/\n|،|,/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 2)
    if (list.length === 0) return
    const n = await run('add', () => teacherApi.addStudents(id, list))
    if (n !== undefined) {
      setNames('')
      await load()
    }
  }

  return (
    <div className="space-y-6">
      <div className="no-print">
        <Link to="/teacher" className="text-sm text-muted hover:underline">
          ← لوحة التحكم
        </Link>
      </div>
      {data.class.is_demo && <DemoBanner />}
      <div className="no-print flex flex-wrap items-center gap-3">
        {rename === null ? (
          <h1 className="text-2xl font-extrabold text-olive-800">{data.class.name}</h1>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              await run('rename', () => teacherApi.saveClass(id, rename))
              setRename(null)
              await load()
            }}
          >
            <input className="input" value={rename} onChange={(e) => setRename(e.target.value)} maxLength={80} aria-label="اسم الصف" />
            <button className="btn-primary btn-sm">حفظ</button>
          </form>
        )}
        <button className="btn-ghost btn-sm" onClick={() => setRename(data.class.name)}>
          تعديل الاسم
        </button>
        <div className="ms-auto flex flex-wrap gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setShowCodes((v) => !v)}>
            {showCodes ? 'إخفاء الرموز' : 'إظهار الرموز'}
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={() => downloadCsv(`رموز-${data.class.name}.csv`, [['الاسم', 'الرمز الشخصي', 'الحالة'], ...data.students.map((s) => [s.full_name, s.access_code, s.code_revoked ? 'مُبطَل' : 'فعّال'])])}
          >
            تصدير الرموز CSV
          </button>
          <button className="btn-ghost btn-sm" onClick={() => window.print()}>
            طباعة بطاقات الرموز
          </button>
          <ConfirmButton
            confirmText="سيُحذف الصف وقائمة طلابه ورموزهم نهائيًا. تبقى الجلسات السابقة بأسماء المشاركين فيها."
            onConfirm={async () => {
              await run('del', () => teacherApi.deleteClass(id))
              nav('/teacher')
            }}
          >
            حذف الصف
          </ConfirmButton>
        </div>
      </div>

      <Alert tone="info" className="no-print">
        لكل طالب رمز دخول شخصي من 8 خانات. سلّم كل طالب رمزه بشكل فردي؛ فمن يعرف رمز غيره يستطيع الدخول باسمه. يمكنك إبطال أي رمز أو تجديده فورًا،
        فيخرج كل جهاز دخل به.
      </Alert>

      <form onSubmit={add} className="card no-print space-y-2 p-4">
        <label className="label" htmlFor="names">
          إضافة طلاب (اسم في كل سطر)
        </label>
        <textarea id="names" className="input" rows={4} value={names} onChange={(e) => setNames(e.target.value)} placeholder={'أحمد محمد\nيوسف علي'} />
        <button className="btn-primary" disabled={busy === 'add' || !names.trim()}>
          {busy === 'add' ? 'جارٍ الإضافة…' : 'إضافة'}
        </button>
      </form>

      <section className="card no-print overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">قائمة الطلاب</caption>
          <thead className="bg-cream-200 text-olive-800">
            <tr>
              <th className="p-3 text-start">#</th>
              <th className="p-3 text-start">الاسم</th>
              <th className="p-3 text-start">الرمز الشخصي</th>
              <th className="p-3 text-start">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s, i) => (
              <tr key={s.id} className="border-t border-cream-200">
                <td className="p-3 text-muted">{i + 1}</td>
                <td className="p-3 font-semibold">{s.full_name}</td>
                <td className="p-3">
                  <span dir="ltr" className={`font-mono font-bold tracking-widest ${s.code_revoked ? 'text-red-700 line-through' : ''}`}>
                    {showCodes ? s.access_code : '••••••••'}
                  </span>
                  {s.code_revoked && <Badge className="ms-2 bg-red-100 text-red-800">مُبطَل</Badge>}
                </td>
                <td className="flex flex-wrap gap-1 p-3">
                  <button className="btn-ghost btn-sm" onClick={async () => (await run('c', () => teacherApi.studentCode(s.id, 'regenerate'), 'جُدّد الرمز')) && load()}>
                    تجديد الرمز
                  </button>
                  {s.code_revoked ? (
                    <button className="btn-ghost btn-sm" onClick={async () => (await run('c', () => teacherApi.studentCode(s.id, 'restore'))) !== undefined && load()}>
                      إعادة التفعيل
                    </button>
                  ) : (
                    <button className="btn-ghost btn-sm" onClick={async () => (await run('c', () => teacherApi.studentCode(s.id, 'revoke'), 'أُبطل الرمز')) !== undefined && load()}>
                      إبطال
                    </button>
                  )}
                  <RenameStudent name={s.full_name} onSave={async (n) => { await run('r', () => teacherApi.renameStudent(s.id, n), 'حُفظ الاسم'); await load() }} />
                  <ConfirmButton confirmText={`حذف ${s.full_name} من قائمة الصف؟`} onConfirm={async () => {
                      if ((await run('d', () => teacherApi.deleteStudent(s.id))) !== undefined) await load()
                    }}>
                    حذف
                  </ConfirmButton>
                </td>
              </tr>
            ))}
            {data.students.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted">
                  لا يوجد طلاب بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* بطاقات الرموز للطباعة فقط */}
      <section className="hidden print:block">
        <h1 className="mb-4 text-xl font-bold">مِحْوَر — رموز الدخول الشخصية: {data.class.name}</h1>
        <div className="grid grid-cols-3 gap-3">
          {data.students
            .filter((s) => !s.code_revoked)
            .map((s) => (
              <div key={s.id} className="rounded-lg border border-dashed border-stone-400 p-3 text-center">
                <p className="font-bold">{s.full_name}</p>
                <p dir="ltr" className="mt-1 font-mono text-xl font-bold tracking-widest">
                  {s.access_code}
                </p>
                <p className="mt-1 text-[10px]">رمز شخصي — لا تشاركه</p>
              </div>
            ))}
        </div>
      </section>
    </div>
  )
}

function RenameStudent({ name, onSave }: { name: string; onSave: (n: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(name)
  return (
    <>
      <button
        className="btn-ghost btn-sm"
        onClick={() => {
          setValue(name)
          setOpen(true)
        }}
      >
        تعديل الاسم
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="تعديل اسم الطالب">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            await onSave(value.trim())
            setOpen(false)
          }}
        >
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} minLength={2} maxLength={80} required aria-label="اسم الطالب" autoFocus />
          <button className="btn-primary" disabled={value.trim().length < 2}>
            حفظ
          </button>
        </form>
      </Modal>
    </>
  )
}
