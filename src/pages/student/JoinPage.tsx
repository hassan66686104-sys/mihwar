import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, DemoBanner, Logo, Motto, Spinner } from '../../components/ui'
import { studentApi } from '../../lib/api'
import { messageFor, toAppError } from '../../lib/api/errors'
import type { SessionLookup } from '../../lib/api/types'
import { STATUS_LABELS } from '../../lib/labels'
import { credentials } from '../../lib/storage'

export default function JoinPage() {
  const { code: codeParam } = useParams()
  const nav = useNavigate()
  const [code, setCode] = useState(codeParam?.toUpperCase() ?? '')
  const [info, setInfo] = useState<SessionLookup | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [studentId, setStudentId] = useState('')
  const [filter, setFilter] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const lookup = async (c: string) => {
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      setInfo(await studentApi.lookup(c))
    } catch (e) {
      setError(toAppError(e).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (codeParam) void lookup(codeParam)
  }, [codeParam])

  const existing = info ? credentials.get(info.session_id) : null
  const roster = useMemo(
    () => (info?.roster ?? []).filter((s) => !filter.trim() || s.full_name.includes(filter.trim())),
    [info, filter],
  )

  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!info || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const r =
        info.join_mode === 'roster'
          ? await studentApi.join(code, studentId, accessCode.trim(), null)
          : await studentApi.join(code, null, null, name.trim())
      if (!r.ok || !r.token || !r.session_id || !r.member_id) {
        setError(messageFor(r.error ?? 'MH_UNKNOWN'))
        return
      }
      credentials.set(r.session_id, { token: r.token, memberId: r.member_id, name: r.display_name ?? '', joinCode: code })
      nav(`/room/${r.session_id}`, { replace: true })
    } catch (e2) {
      setError(toAppError(e2).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-xl items-center justify-between px-4 py-5">
        <Link to="/">
          <Logo size="sm" />
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16">
        {!codeParam && (
          <form
            className="card p-6"
            onSubmit={(e) => {
              e.preventDefault()
              const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
              if (c.length === 6) nav(`/join/${c}`)
            }}
          >
            <h1 className="mb-3 text-xl font-bold text-olive-800">الدخول إلى جلسة</h1>
            <label htmlFor="jc" className="label">
              رمز الجلسة
            </label>
            <input
              id="jc"
              dir="ltr"
              className="input text-center text-2xl font-bold tracking-[0.4em]"
              value={code}
              maxLength={8}
              autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button className="btn-primary mt-4 w-full">متابعة</button>
          </form>
        )}

        {loading && (
          <div className="card p-6">
            <Spinner label="جارٍ التحقق من رمز الجلسة…" />
          </div>
        )}
        {error && !info && (
          <Alert tone="error" className="mt-4">
            {error}{' '}
            <Link to="/join" className="font-bold underline">
              جرّب رمزًا آخر
            </Link>
          </Alert>
        )}

        {info && (
          <div className="card p-6">
            {info.is_demo && <DemoBanner className="mb-4" />}
            <p className="text-sm font-semibold text-gold-600">مِحْوَر · رمز الجلسة {code}</p>
            <h1 className="mt-1 text-2xl font-bold text-olive-800">{info.title}</h1>
            <p className="text-muted">
              {info.lesson && <>درس: {info.lesson} · </>}المعلم: {info.teacher_name} · الحالة: {STATUS_LABELS[info.status]}
            </p>

            {existing && (
              <div className="mt-4 rounded-xl border border-olive-200 bg-olive-50 p-4">
                <p className="mb-2">دخلت هذه الجلسة سابقًا من هذا الجهاز باسم «{existing.name}».</p>
                <Link to={`/room/${info.session_id}`} className="btn-primary w-full">
                  متابعة إلى غرفة النقاش
                </Link>
              </div>
            )}

            {!info.joinable ? (
              <Alert tone="warn" className="mt-4">
                {info.status === 'draft' ? messageFor('MH_SESSION_NOT_STARTED') : messageFor('MH_SESSION_CLOSED')}
              </Alert>
            ) : (
              <form onSubmit={join} className="mt-5 space-y-4">
                {info.join_mode === 'roster' ? (
                  <>
                    <fieldset>
                      <legend className="label">اختر اسمك من قائمة الصف</legend>
                      {info.roster.length > 8 && (
                        <input className="input mb-2" placeholder="ابحث عن اسمك…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                      )}
                      <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                        {roster.map((s) => (
                          <label
                            key={s.id}
                            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 ${
                              studentId === s.id ? 'border-olive-500 bg-olive-50 font-bold' : 'border-cream-300 bg-white'
                            }`}
                          >
                            <input type="radio" name="student" value={s.id} checked={studentId === s.id} onChange={() => setStudentId(s.id)} className="accent-olive-700" />
                            {s.full_name}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div>
                      <label htmlFor="ac" className="label">
                        رمزك الشخصي (من المعلم)
                      </label>
                      <input
                        id="ac"
                        dir="ltr"
                        className="input text-center text-xl font-bold tracking-[0.3em]"
                        value={accessCode}
                        maxLength={8}
                        autoComplete="off"
                        onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                        required
                      />
                      <p className="mt-1 text-xs text-muted">الرمز الشخصي يثبت أنك صاحب الاسم، فلا تشاركه مع أحد.</p>
                    </div>
                  </>
                ) : (
                  <div>
                    <label htmlFor="nm" className="label">
                      اسمك الكامل
                    </label>
                    <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required />
                    <p className="mt-1 text-xs text-muted">سيراجع المعلم اسمك ويعتمد دخولك قبل أن تتمكن من المشاركة.</p>
                  </div>
                )}
                {error && <Alert tone="error">{error}</Alert>}
                <button
                  type="submit"
                  className="btn-primary w-full text-lg"
                  disabled={submitting || (info.join_mode === 'roster' ? !studentId || accessCode.trim().length < 8 : name.trim().length < 2)}
                >
                  {submitting ? 'جارٍ التحقق…' : 'دخول غرفة النقاش'}
                </button>
              </form>
            )}
          </div>
        )}
        <Motto className="mt-8 text-center" />
      </main>
    </div>
  )
}
