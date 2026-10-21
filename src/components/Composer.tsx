import { useEffect, useRef, useState } from 'react'
import { studentApi } from '../lib/api'
import { toAppError } from '../lib/api/errors'
import type { EvidenceInput, PostKind, Topic } from '../lib/api/types'
import { KIND_LABELS, STUDENT_KINDS } from '../lib/labels'
import { drafts, uuid, type Draft } from '../lib/storage'

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; pending: boolean } | { kind: 'failed'; message: string; retryable: boolean }

const EVIDENCE_FIELDS: Record<string, { key: keyof EvidenceInput; label: string; hint?: string; textarea?: boolean; ltr?: boolean }[]> = {
  quran: [
    { key: 'quote', label: 'نص الآية', textarea: true },
    { key: 'surah', label: 'اسم السورة' },
    { key: 'ayah', label: 'رقم الآية' },
  ],
  hadith: [
    { key: 'quote', label: 'نص الحديث', textarea: true },
    { key: 'hadith_source', label: 'مصدر الحديث (اختياري)', hint: 'مثل: صحيح البخاري، سنن الترمذي' },
    { key: 'hadith_grade', label: 'درجة الحديث (اختياري)', hint: 'اكتبها فقط إن كنت متأكدًا من مصدر موثوق، واتركها فارغة إن لم تعرفها' },
  ],
  fiqh: [
    { key: 'quote', label: 'نص الدليل أو القاعدة', textarea: true },
    { key: 'book_title', label: 'المصدر (اختياري)' },
  ],
  textbook: [
    { key: 'quote', label: 'النص من الكتاب', textarea: true },
    { key: 'book_title', label: 'عنوان الكتاب' },
    { key: 'page', label: 'رقم الصفحة' },
  ],
  example: [],
  other: [
    { key: 'quote', label: 'نص الشاهد', textarea: true },
    { key: 'book_title', label: 'المصدر (اختياري)' },
  ],
}

const EVIDENCE_KINDS = new Set<PostKind>(['quran', 'hadith', 'fiqh', 'textbook', 'example'])

interface Props {
  sessionId: string
  token: string
  parentId?: string | null
  topics?: Topic[]
  evidenceEnabled: boolean
  allowedKinds?: PostKind[]
  disabledReason?: string | null
  onDone?: () => void
  onSaved?: () => void
  compact?: boolean
  autoFocus?: boolean
}

export function Composer({ sessionId, token, parentId = null, topics = [], evidenceEnabled, allowedKinds, disabledReason, onDone, onSaved, compact, autoFocus }: Props) {
  const kinds = (allowedKinds ?? STUDENT_KINDS).filter((k) => evidenceEnabled || !EVIDENCE_KINDS.has(k))
  const initial = drafts.get(sessionId, parentId)
  const [draft, setDraft] = useState<Draft>(
    () => initial ?? { clientId: uuid(), kind: parentId ? 'rebuttal' : 'opinion', body: '', evidence: {}, topicId: null },
  )
  const [showEvidence, setShowEvidence] = useState(() => Object.values(initial?.evidence ?? {}).some(Boolean))
  const [state, setState] = useState<SaveState>(initial?.body ? { kind: 'failed', message: 'لديك نص محفوظ على هذا الجهاز لم يُرسل بعد.', retryable: true } : { kind: 'idle' })
  const busy = useRef(false)

  // حفظ المسودة محليًا مع كل تغيير حتى لا يضيع النص عند انقطاع الاتصال أو تحديث الصفحة
  useEffect(() => {
    if (draft.body || Object.values(draft.evidence).some(Boolean)) drafts.set(sessionId, parentId, draft)
  }, [draft, sessionId, parentId])

  // إعادة الإرسال تلقائيًا عند عودة الاتصال إذا كان آخر فشل بسبب الشبكة
  useEffect(() => {
    const on = () => {
      if (state.kind === 'failed' && state.retryable && draft.body.trim()) void submit()
    }
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  })

  const kind = draft.kind as PostKind
  const fields = EVIDENCE_FIELDS[EVIDENCE_KINDS.has(kind) ? kind : 'other'] ?? []
  const evidenceVisible = evidenceEnabled && (EVIDENCE_KINDS.has(kind) || showEvidence)

  const setEv = (k: string, v: string) => setDraft((d) => ({ ...d, evidence: { ...d.evidence, [k]: v } }))

  async function submit() {
    if (busy.current || !draft.body.trim()) return
    busy.current = true
    setState({ kind: 'saving' })
    try {
      const evidence = evidenceVisible ? (draft.evidence as EvidenceInput) : null
      const r = await studentApi.submit(token, {
        clientId: draft.clientId,
        kind,
        body: draft.body.trim(),
        parentId,
        topicId: draft.topicId,
        evidence,
      })
      // نجاح مؤكَّد من الخادم فقط
      drafts.clear(sessionId, parentId)
      setDraft({ clientId: uuid(), kind: parentId ? 'rebuttal' : 'opinion', body: '', evidence: {}, topicId: draft.topicId })
      setShowEvidence(false)
      setState({ kind: 'saved', pending: r.status === 'pending' })
      onSaved?.()
      if (onDone) setTimeout(onDone, 900)
    } catch (e) {
      const err = toAppError(e)
      const retryable = err.code === 'MH_NETWORK' || err.code === 'MH_RATE_LIMIT'
      // نحتفظ بالنص ورمز الإرسال نفسه (clientId) حتى لا تتكرر المشاركة عند إعادة المحاولة
      setState({ kind: 'failed', message: err.message, retryable })
    } finally {
      busy.current = false
    }
  }

  const disabled = !!disabledReason
  return (
    <form
      className={compact ? 'mt-3 space-y-2' : 'space-y-3'}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`kind-${parentId ?? 'root'}`}>
          نوع المشاركة
        </label>
        <select
          id={`kind-${parentId ?? 'root'}`}
          className="input w-auto min-w-40 flex-1 py-1.5"
          value={draft.kind}
          onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
          disabled={disabled}
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {!parentId && topics.length > 0 && (
          <select
            aria-label="المحور"
            className="input w-auto min-w-40 flex-1 py-1.5"
            value={draft.topicId ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, topicId: e.target.value || null }))}
            disabled={disabled}
          >
            <option value="">المحور: عام</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
      </div>

      <label className="sr-only" htmlFor={`body-${parentId ?? 'root'}`}>
        نص المشاركة
      </label>
      <textarea
        id={`body-${parentId ?? 'root'}`}
        className="input min-h-24 resize-y"
        rows={compact ? 2 : 3}
        maxLength={2000}
        placeholder={disabledReason ?? (parentId ? 'اكتب ردّك بأدب واحترام…' : 'اكتب مشاركتك…')}
        value={draft.body}
        onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
        disabled={disabled}
        autoFocus={autoFocus}
      />

      {evidenceEnabled && !EVIDENCE_KINDS.has(kind) && !disabled && (
        <button type="button" className="text-sm font-semibold text-olive-700 underline-offset-4 hover:underline" onClick={() => setShowEvidence((v) => !v)}>
          {showEvidence ? 'إزالة الدليل' : '+ إرفاق دليل أو شاهد'}
        </button>
      )}

      {evidenceVisible && !disabled && (
        <fieldset className="space-y-2 rounded-xl border border-gold-200 bg-gold-50/50 p-3">
          <legend className="px-1 text-sm font-bold text-gold-700">الدليل أو الشاهد (الحقول اختيارية عند عدم توفر بياناتها)</legend>
          {fields.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`${f.key}-${parentId ?? 'root'}`}>
                {f.label}
              </label>
              {f.textarea ? (
                <textarea id={`${f.key}-${parentId ?? 'root'}`} className="input" rows={2} maxLength={2000} value={draft.evidence[f.key] ?? ''} onChange={(e) => setEv(f.key, e.target.value)} />
              ) : (
                <input id={`${f.key}-${parentId ?? 'root'}`} className="input" maxLength={160} value={draft.evidence[f.key] ?? ''} onChange={(e) => setEv(f.key, e.target.value)} />
              )}
              {f.hint && <p className="mt-0.5 text-xs text-muted">{f.hint}</p>}
            </div>
          ))}
          <div>
            <label className="label" htmlFor={`reasoning-${parentId ?? 'root'}`}>
              {kind === 'example' ? 'وجه الربط بموضوع النقاش' : 'شرح وجه الاستدلال'}
            </label>
            <textarea id={`reasoning-${parentId ?? 'root'}`} className="input" rows={2} maxLength={1000} value={draft.evidence.reasoning ?? ''} onChange={(e) => setEv('reasoning', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={`url-${parentId ?? 'root'}`}>
              رابط المصدر (اختياري)
            </label>
            <input id={`url-${parentId ?? 'root'}`} className="input" dir="ltr" type="url" placeholder="https://" value={draft.evidence.url ?? ''} onChange={(e) => setEv('url', e.target.value)} />
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary min-w-28" disabled={disabled || state.kind === 'saving' || !draft.body.trim()}>
          {state.kind === 'saving' ? 'جارٍ الإرسال…' : state.kind === 'failed' && draft.body ? 'إعادة المحاولة' : parentId ? 'إرسال الرد' : 'إرسال المشاركة'}
        </button>
        {onDone && (
          <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
            إلغاء
          </button>
        )}
        <span className="text-sm" aria-live="polite">
          {state.kind === 'saving' && <span className="text-muted">جارٍ الحفظ على الخادم…</span>}
          {state.kind === 'saved' && (
            <span className="font-semibold text-olive-700">{state.pending ? '✓ حُفظت، وستظهر لزملائك بعد مراجعة المعلم' : '✓ حُفظت مشاركتك'}</span>
          )}
          {state.kind === 'failed' && <span className="font-semibold text-red-700">{state.message} {state.retryable && 'نصك محفوظ على جهازك.'}</span>}
        </span>
      </div>
    </form>
  )
}
