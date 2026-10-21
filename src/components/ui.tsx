import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { APP_MOTTO, APP_NAME, APP_TAGLINE } from '../lib/labels'
import type { Connection } from '../lib/useLiveState'

export function Logo({ size = 'md', withText = true }: { size?: 'sm' | 'md' | 'lg'; withText?: boolean }) {
  const px = size === 'lg' ? 64 : size === 'md' ? 40 : 30
  return (
    <span className="inline-flex items-center gap-3">
      <svg width={px} height={px} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#3f4e2b" />
        <circle cx="32" cy="32" r="17" fill="none" stroke="#c9a85a" strokeWidth="3.5" />
        <circle cx="32" cy="32" r="9" fill="none" stroke="#e9d6a0" strokeWidth="2" strokeDasharray="3 3" />
        <circle cx="32" cy="32" r="4" fill="#c9a85a" />
      </svg>
      {withText && (
        <span className="leading-tight">
          <span className={`block font-extrabold text-olive-800 ${size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-2xl' : 'text-xl'}`}>{APP_NAME}</span>
          {size !== 'sm' && <span className="block text-xs font-semibold text-gold-600">{APP_TAGLINE}</span>}
        </span>
      )}
    </span>
  )
}

export function Motto({ className = '' }: { className?: string }) {
  return <p className={`font-semibold text-gold-600 ${className}`}>«{APP_MOTTO}»</p>
}

export function Spinner({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-olive-200 border-t-olive-600" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Spinner label={label} />
    </div>
  )
}

export function Alert({ tone = 'info', children, className = '' }: { tone?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode; className?: string }) {
  const styles = {
    info: 'border-olive-200 bg-olive-50 text-olive-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-olive-300 bg-olive-100 text-olive-900',
    warn: 'border-gold-300 bg-gold-50 text-gold-700',
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${styles} ${className}`}>
      {children}
    </div>
  )
}

export function Badge({ className = '', children }: { className?: string; children: ReactNode }) {
  return <span className={`chip ${className}`}>{children}</span>
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-6 py-10 text-center">
      <p className="font-bold text-olive-800">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  )
}

export function DemoBanner({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-gold-300 bg-gold-50 px-4 py-2 text-sm font-semibold text-gold-700 ${className}`} role="note">
      بيانات تجريبية: الأسماء والمشاركات وهمية لأغراض العرض، وليست لطلاب حقيقيين، ومنفصلة عن الجلسات الفعلية.
    </div>
  )
}

const CONNECTION_TEXT: Record<Connection, { label: string; dot: string; hint: string }> = {
  live: { label: 'متصل', dot: 'bg-olive-500', hint: 'التحديثات تصل فورًا' },
  polling: { label: 'متصل (تحديث دوري)', dot: 'bg-gold-400', hint: 'القناة الفورية متعطلة؛ نحدّث كل بضع ثوانٍ' },
  connecting: { label: 'جارٍ الاتصال…', dot: 'bg-gold-300', hint: 'جارٍ الاتصال بالخادم' },
  offline: { label: 'انقطع الاتصال', dot: 'bg-red-500', hint: 'لا يوجد اتصال بالخادم؛ سنعيد المحاولة تلقائيًا' },
}

export function ConnectionBadge({ connection }: { connection: Connection }) {
  const c = CONNECTION_TEXT[connection]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted" title={c.hint} role="status" aria-live="polite">
      <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} aria-hidden="true" />
      {c.label}
    </span>
  )
}

export function OfflineBar({ connection }: { connection: Connection }) {
  if (connection !== 'offline') return null
  return (
    <div className="sticky top-0 z-40 bg-red-700 px-4 py-2 text-center text-sm font-semibold text-white" role="alert">
      انقطع الاتصال بالخادم مؤقتًا. ما تكتبه محفوظ على جهازك، وسنعيد المزامنة عند عودة الاتصال.
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      dir="rtl"
      className={`m-auto w-[calc(100%-1.5rem)] ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl border border-cream-300 bg-cream-50 p-0 text-ink shadow-xl backdrop:bg-olive-900/40`}
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-bold text-olive-800">{title}</h2>
            <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label="إغلاق">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

/** زر يطلب تأكيدًا قبل تنفيذ إجراء حساس */
export function ConfirmButton({
  onConfirm,
  children,
  confirmText,
  className = 'btn-danger btn-sm',
  disabled,
}: {
  onConfirm: () => void | Promise<void>
  children: ReactNode
  confirmText: string
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} disabled={disabled}>
        {children}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="تأكيد الإجراء">
        <p className="mb-5">{confirmText}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                setOpen(false)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'جارٍ التنفيذ…' : 'تأكيد'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            إلغاء
          </button>
        </div>
      </Modal>
    </>
  )
}

// ------------------------------- الإشعارات -------------------------------
type Toast = { id: number; tone: 'success' | 'error' | 'info'; text: string }
const ToastCtx = createContext<(tone: Toast['tone'], text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, tone, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
              t.tone === 'error' ? 'bg-red-700 text-white' : t.tone === 'success' ? 'bg-olive-700 text-cream-50' : 'bg-olive-900 text-cream-50'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

/** يغلّف إجراءً غير متزامن: يمنع النقر المتكرر ويعرض الخطأ بالعربية */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(key)
      try {
        const r = await fn()
        if (success) toast('success', success)
        return r
      } catch (e) {
        toast('error', (e as Error).message)
        return undefined
      } finally {
        setBusy(null)
      }
    },
    [toast],
  )
  return { busy, run }
}

export function SiteFooter() {
  return (
    <footer className="no-print mt-12 border-t border-cream-300 py-6 text-center text-sm text-muted">
      <Motto className="mb-1" />
      <p>
        <Link to="/" className="underline-offset-4 hover:underline">
          مِحْوَر
        </Link>{' '}
        — منصة لإدارة النقاش الصفي في دروس التربية الإسلامية
      </p>
    </footer>
  )
}
