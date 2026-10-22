import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Alert, Logo, Motto } from '../../components/ui'
import { backend } from '../../lib/api'
import { toAppError } from '../../lib/api/errors'

// اسم المستخدم يُحوَّل إلى عنوان على النطاق المحجوز ‎.invalid‎ (RFC 2606): لا يملكه أحد ولا تصل إليه رسائل،
// فلا يستطيع طرف آخر استلام رابط استعادة لهذا الحساب.
const USERNAME_DOMAIN = 'teachers.mihwar.invalid'
const USERNAME_RE = /^[a-z0-9_.-]{3,30}$/

function toAuthEmail(id: string): string {
  const v = id.trim().toLowerCase()
  if (v.includes('@')) return v
  if (!USERNAME_RE.test(v)) throw new Error('اسم المستخدم من 3 إلى 30 حرفًا إنجليزيًا أو رقمًا (ويُسمح بـ _ . -).')
  return `${v}@${USERNAME_DOMAIN}`
}

export default function TeacherLogin() {
  const nav = useNavigate()
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null)

  const switchTo = (m: typeof mode) => {
    setMode(m)
    setMsg(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'in') {
        await backend.auth.signIn(toAuthEmail(login), password)
        nav('/teacher', { replace: true })
      } else if (mode === 'up') {
        if (password.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.')
        const authEmail = toAuthEmail(login)
        const signedIn = await backend.auth.signUp(authEmail, password)
        if (signedIn) nav('/teacher', { replace: true })
        else if (authEmail.endsWith(USERNAME_DOMAIN))
          throw new Error('أُنشئ الحساب لكنه يحتاج تأكيد بريد، واسم المستخدم لا بريد له. عطّل «Confirm email» في إعدادات Supabase Auth، أو أنشئ الحساب ببريدك.')
        else setMsg({ tone: 'success', text: 'أُنشئ الحساب. افتح رسالة التأكيد المرسلة إلى بريدك، ثم سجّل الدخول.' })
      } else {
        if (!login.includes('@')) throw new Error('الاستعادة تعمل للحسابات المسجلة ببريد فقط. حساب اسم المستخدم لا بريد له؛ إن نسيت كلمة مروره فأنشئ حسابًا جديدًا.')
        await backend.auth.resetPassword(toAuthEmail(login), `${window.location.origin}/teacher`)
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
            {mode === 'reset' ? 'البريد الإلكتروني' : 'اسم المستخدم أو البريد الإلكتروني'}
          </label>
          <input
            id="em"
            type="text"
            dir="ltr"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
          {mode === 'up' && <p className="mt-1 text-xs text-muted">اكتب اسم مستخدم بالإنجليزية (مثل hassan) إن لم ترد استخدام بريد. حساب اسم المستخدم لا يمكن استعادة كلمة مروره.</p>}
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
            <button type="button" className="font-semibold text-olive-700 underline-offset-4 hover:underline" onClick={() => switchTo('in')}>
              لدي حساب
            </button>
          )}
          {mode !== 'up' && (
            <button type="button" className="font-semibold text-olive-700 underline-offset-4 hover:underline" onClick={() => switchTo('up')}>
              إنشاء حساب جديد
            </button>
          )}
          {mode === 'in' && (
            <button type="button" className="text-muted underline-offset-4 hover:underline" onClick={() => switchTo('reset')}>
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
