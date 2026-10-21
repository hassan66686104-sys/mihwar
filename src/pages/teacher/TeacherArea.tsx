import { lazy, Suspense, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, Route, Routes } from 'react-router'
import { Alert, Logo, PageLoader, SiteFooter } from '../../components/ui'
import { teacherApi } from '../../lib/api'
import { toAppError } from '../../lib/api/errors'
import { TeacherProvider, useTeacher } from './auth'

const Dashboard = lazy(() => import('./Dashboard'))
const ClassPage = lazy(() => import('./ClassPage'))
const NewSession = lazy(() => import('./NewSession'))
const SessionControl = lazy(() => import('./SessionControl'))
const Present = lazy(() => import('./Present'))
const Report = lazy(() => import('./Report'))

export default function TeacherArea() {
  return (
    <TeacherProvider>
      <Guard>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="classes/:id" element={<ClassPage />} />
              <Route path="new" element={<NewSession />} />
              <Route path="s/:id" element={<SessionControl />} />
              <Route path="s/:id/report" element={<Report />} />
            </Route>
            <Route path="s/:id/present" element={<Present />} />
            <Route path="*" element={<Navigate to="/teacher" replace />} />
          </Routes>
        </Suspense>
      </Guard>
    </TeacherProvider>
  )
}

// لا تُعرض أي صفحة إدارية دون جلسة دخول صالحة؛ والخادم يتحقق من الصلاحية مرة أخرى في كل طلب
function Guard({ children }: { children: React.ReactNode }) {
  const t = useTeacher()
  if (t.loading) return <PageLoader label="جارٍ التحقق من الحساب…" />
  if (!t.user) return <Navigate to="/teacher/login" replace />
  if (t.needsProfile) return <ProfileSetup />
  if (t.error)
    return (
      <div className="mx-auto max-w-md p-6">
        <Alert tone="error">{t.error}</Alert>
        <button className="btn-primary mt-4" onClick={() => void t.reload()}>
          إعادة المحاولة
        </button>
      </div>
    )
  return <>{children}</>
}

function ProfileSetup() {
  const t = useTeacher()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <Logo size="lg" />
      <form
        className="card mt-6 space-y-4 p-6"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await teacherApi.bootstrap(name.trim())
            await t.reload()
          } catch (e2) {
            setErr(toAppError(e2).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <h1 className="text-xl font-bold text-olive-800">مرحبًا بك في مِحْوَر</h1>
        <p className="text-sm text-muted">اكتب اسمك كما سيظهر للطلاب في غرفة النقاش (مثل: أ. محمد العلي).</p>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required aria-label="الاسم الظاهر" />
        {err && <Alert tone="error">{err}</Alert>}
        <button className="btn-primary w-full" disabled={busy || name.trim().length < 2}>
          حفظ والمتابعة
        </button>
      </form>
    </main>
  )
}

function Layout() {
  const t = useTeacher()
  const link = ({ isActive }: { isActive: boolean }) => `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-olive-100 text-olive-800' : 'text-muted hover:bg-cream-200'}`
  return (
    <div className="min-h-dvh">
      <header className="no-print border-b border-cream-300 bg-cream-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/teacher" aria-label="لوحة المعلم">
            <Logo size="sm" />
          </Link>
          <nav className="flex gap-1" aria-label="التنقل الرئيس">
            <NavLink to="/teacher" end className={link}>
              لوحة التحكم
            </NavLink>
            <NavLink to="/teacher/new" className={link}>
              جلسة جديدة
            </NavLink>
          </nav>
          <div className="ms-auto flex items-center gap-3 text-sm">
            <span className="font-semibold text-olive-800">{t.profile?.display_name}</span>
            <button className="btn-ghost btn-sm" onClick={() => void t.signOut()}>
              خروج
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
