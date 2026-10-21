import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Alert, Logo, Motto } from '../../components/ui'
import { backend } from '../../lib/api'
import { toAppError } from '../../lib/api/errors'

export default function TeacherLogin() {
  const nav = useNavigate()
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'in') {
        await backend.auth.signIn(email.trim(), password)
        nav('/teacher', { replace: true })
      } else if (mode === 'up') {
        if (password.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.')
        const signedIn = await backend.auth.signUp(email.trim(), password)
        if (signedIn) nav('/teacher', { replace: true })
        else setMsg({ tone: 'success', text: 'أُنشئ الحساب. افتح رسالة التأكيد المرسلة إلى بريدك، ثم سجّل الدخول.' })
      } else {
        await backend.auth.resetPassword(email.trim(), `${window.location.origin}/teacher`)
        setMsg({ tone: 'success', text: 'إن كان البريد مسجلًا فستصلك رسالة لإعادة تعيين كلمة المرور.' })
      }
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof Error && !('code' in err) ? err.message : toAppError(err).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link to="/" className="mb-6 self-center">
        <Logo size="lg" />
      </Link>
      <form className="card space-y-4 p-6" onSubmit={submit}>
        <h1 className="text-xl font-bold text-olive-800">{mode === 'in' ? 'دخول المعلم' : mode === 'up' ? 'إنشاء حساب معلم' : 'استعادة كلمة المرور'}</h1>
        <div>
          <label className="label" htmlFor="em">
            البريد الإلكتروني
          </label>
          <input id="em" type="email" dir="ltr" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {mode !== 'reset' && (
          <div>
            <label className="label" htmlFor="pw">
              كلمة المرور
            </label>
            <input
              id="pw"
              type="password"
              dir="ltr"
              className="input"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              minLength={mode === 'up' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        )}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'جارٍ التنفيذ…' : mode === 'in' ? 'تسجيل الدخول' : mode === 'up' ? 'إنشاء الحساب' : 'إرسال رابط الاستعادة'}
        </button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          {mode !== 'in' && (
            <button type="button" className="font-semibold text-olive-700 underline-offset-4 hover:underline" onClick={() => setMode('in')}>
              لدي حساب
            </button>
          )}
          {mode !== 'up' && (
            <button type="button" className="font-semibold text-olive-700 underline-offset-4 hover:underline" onClick={() => setMode('up')}>
              إنشاء حساب جديد
            </button>
          )}
          {mode === 'in' && (
            <button type="button" className="text-muted underline-offset-4 hover:underline" onClick={() => setMode('reset')}>
              نسيت كلمة المرور؟
            </button>
          )}
        </div>
        <p className="text-xs text-muted">لوحة المعلم محمية بحساب Supabase Auth. رابط الجلسة ورمزها لا يمنحان أي صلاحية إدارية.</p>
      </form>
      <Motto className="mt-6 text-center" />
    </main>
  )
}
