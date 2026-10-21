// تخزين محلي للأشياء الخاصة بهذا الجهاز فقط: رمز وصول الطالب ومسودات النصوص.
// ليس قاعدة بيانات؛ كل البيانات الدائمة في Supabase.

export interface MemberCredential {
  token: string
  memberId: string
  name: string
  joinCode: string
}

const safe = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* التخزين غير متاح (وضع التصفح الخاص مثلًا) */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* لا شيء */
    }
  },
}

export const credentials = {
  get(sessionId: string): MemberCredential | null {
    const raw = safe.get(`mihwar:member:${sessionId}`)
    if (!raw) return null
    try {
      return JSON.parse(raw) as MemberCredential
    } catch {
      return null
    }
  },
  set(sessionId: string, c: MemberCredential) {
    safe.set(`mihwar:member:${sessionId}`, JSON.stringify(c))
  },
  clear(sessionId: string) {
    safe.remove(`mihwar:member:${sessionId}`)
  },
}

export interface Draft {
  clientId: string
  kind: string
  body: string
  evidence: Record<string, string>
  topicId: string | null
}

export const drafts = {
  key: (sessionId: string, parentId: string | null) => `mihwar:draft:${sessionId}:${parentId ?? 'root'}`,
  get(sessionId: string, parentId: string | null): Draft | null {
    const raw = safe.get(drafts.key(sessionId, parentId))
    if (!raw) return null
    try {
      return JSON.parse(raw) as Draft
    } catch {
      return null
    }
  },
  set(sessionId: string, parentId: string | null, d: Draft) {
    safe.set(drafts.key(sessionId, parentId), JSON.stringify(d))
  },
  clear(sessionId: string, parentId: string | null) {
    safe.remove(drafts.key(sessionId, parentId))
  },
}

export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // احتياطي للمتصفحات القديمة غير الآمنة (http)
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
