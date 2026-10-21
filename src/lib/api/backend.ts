// طبقة البيانات: الواجهات لا تعرف Supabase مباشرة، بل تتعامل مع هذه الواجهة البرمجية فقط.
// هذا يسمح باستبدال مزوّد البيانات (أو إضافة محاكٍ للاختبار) دون إعادة بناء الصفحات.

export type LinkStatus = 'connecting' | 'live' | 'offline'

export interface AuthUser {
  id: string
  email: string | null
}

export interface Backend {
  readonly configured: boolean
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>
  auth: {
    getUser(): Promise<AuthUser | null>
    signIn(email: string, password: string): Promise<void>
    /** يعيد true إذا أُنشئت جلسة دخول مباشرة، وfalse إذا تطلب الأمر تأكيد البريد */
    signUp(email: string, password: string): Promise<boolean>
    signOut(): Promise<void>
    resetPassword(email: string, redirectTo: string): Promise<void>
    onChange(cb: (user: AuthUser | null) => void): () => void
  }
  /** الاشتراك في إشعارات تغيّر جلسة؛ الإشعار لا يحمل بيانات، فيُعاد الجلب من قاعدة البيانات */
  subscribe(sessionId: string, onChange: (table: string) => void, onStatus: (s: LinkStatus) => void): () => void
}
