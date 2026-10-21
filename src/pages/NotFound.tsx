import { Link } from 'react-router'
import { Logo } from '../components/ui'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-xl font-bold text-olive-800">الصفحة غير موجودة</h1>
      <p className="text-muted">تأكد من الرابط، أو عد إلى الصفحة الرئيسة.</p>
      <Link to="/" className="btn-primary">
        الصفحة الرئيسة
      </Link>
    </main>
  )
}
