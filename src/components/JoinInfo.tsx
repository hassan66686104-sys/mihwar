import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useToast } from './ui'

/** رابط المشاركة الفعلي مبني من عنوان الموقع الحالي (وليس رابطًا وهميًا) */
export function joinUrl(code: string) {
  return `${window.location.origin}/join/${code}`
}

export function useQr(text: string, size = 240) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: '#2a331e', light: '#fffdf8' } }).then((d) => alive && setSrc(d))
    return () => {
      alive = false
    }
  }, [text, size])
  return src
}

export function JoinInfo({ joinCode, compact = false }: { joinCode: string; compact?: boolean }) {
  const toast = useToast()
  const url = joinUrl(joinCode)
  const qr = useQr(url)
  const [showQr, setShowQr] = useState(!compact)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast('success', 'نُسخ رابط المشاركة')
    } catch {
      toast('error', 'تعذّر النسخ تلقائيًا؛ انسخ الرابط يدويًا')
    }
  }
  return (
    <section className="card p-4" aria-label="بيانات دخول الطلاب">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">رمز الجلسة</p>
          <p className="text-4xl font-extrabold tracking-[0.3em] text-olive-800" dir="ltr">
            {joinCode}
          </p>
          <p className="mt-2 break-all text-sm" dir="ltr">
            {url}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={copy}>
              نسخ الرابط
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowQr((v) => !v)}>
              {showQr ? 'إخفاء رمز QR' : 'عرض رمز QR'}
            </button>
          </div>
        </div>
        {showQr && qr && <img src={qr} alt={`رمز QR لرابط الجلسة ${joinCode}`} className="h-40 w-40 rounded-xl border border-cream-300" />}
      </div>
    </section>
  )
}
