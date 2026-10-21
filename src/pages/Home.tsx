import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Logo, Motto, SiteFooter } from '../components/ui'
import { MODE_HINTS, MODE_LABELS } from '../lib/labels'
import type { Mode } from '../lib/api/types'

const MODE_ICONS: Record<Mode, string> = { forum: '💬', debate: '⚖️', turns: '✋', poll: '📊' }

export default function Home() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '')

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <Link to="/teacher" className="btn-ghost btn-sm">
          دخول المعلم
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="grid items-center gap-8 py-8 md:grid-cols-2 md:py-14">
          <div>
            <h1 className="text-3xl leading-snug font-extrabold text-olive-800 md:text-4xl">ساحة النقاش الصفّي للتربية الإسلامية</h1>
            <Motto className="mt-3 text-lg" />
            <p className="mt-4 text-muted">
              منصة يدير بها المعلم النقاش الصفي: منتدى حواري، ومناظرة بين الفرق، ونقاش بالدور ورفع اليد، وتصويت، مع نظام للأدلة والشواهد وتقرير
              للمعلم في نهاية الجلسة.
            </p>
          </div>

          <form
            className="card p-6"
            onSubmit={(e) => {
              e.preventDefault()
              if (clean.length === 6) nav(`/join/${clean}`)
            }}
          >
            <h2 className="mb-1 text-xl font-bold text-olive-800">دخول الطالب</h2>
            <p className="mb-4 text-sm text-muted">اكتب رمز الجلسة الذي يعرضه المعلم (6 أحرف وأرقام).</p>
            <label htmlFor="code" className="label">
              رمز الجلسة
            </label>
            <input
              id="code"
              className="input text-center text-2xl font-bold tracking-[0.4em]"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABC234"
            />
            <button type="submit" className="btn-primary mt-4 w-full text-lg" disabled={clean.length !== 6}>
              متابعة
            </button>
          </form>
        </section>

        <section aria-labelledby="modes" className="py-6">
          <h2 id="modes" className="mb-4 text-xl font-bold text-olive-800">
            أنماط النقاش
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <div key={m} className="card p-5">
                <div className="mb-2 text-3xl" aria-hidden="true">
                  {MODE_ICONS[m]}
                </div>
                <h3 className="font-bold text-olive-800">{MODE_LABELS[m]}</h3>
                <p className="mt-1 text-sm text-muted">{MODE_HINTS[m]}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card my-6 grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-lg font-bold text-olive-800">هل أنت معلم؟</h2>
            <p className="text-sm text-muted">
              أنشئ حسابًا، ثم جرّب الجلسة النموذجية «التوكل على الله والأخذ بالأسباب» ببيانات تجريبية وهمية قبل أن تبدأ درسك الفعلي.
            </p>
          </div>
          <Link to="/teacher" className="btn-gold">
            لوحة المعلم
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
