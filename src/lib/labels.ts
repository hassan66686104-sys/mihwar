import type { Mode, PollKind, PollPhase, PostKind, SessionStatus, TeacherTag, TeamColor } from './api/types'

export const APP_NAME = 'مِحْوَر'
export const APP_TAGLINE = 'ساحة النقاش الصفّي للتربية الإسلامية'
export const APP_MOTTO = 'نتحاور بأدب، ونستدل بعلم، ونختلف باحترام'

export const MODE_LABELS: Record<Mode, string> = {
  forum: 'المنتدى الحواري',
  debate: 'المناظرة بين الفرق',
  turns: 'النقاش بالدور',
  poll: 'التصويت',
}

export const MODE_HINTS: Record<Mode, string> = {
  forum: 'يكتب الطلاب مشاركاتهم ويردّون على مشاركات محددة.',
  debate: 'فريقان أو أكثر يتناوبون على الحجة والرد والتعقيب في مراحل يديرها المعلم.',
  turns: 'رفع اليد إلكترونيًا: قائمة انتظار مشتركة، والمعلم يمنح الدور بمؤقت.',
  poll: 'تصويت واستطلاعات رأي قبل النقاش وبعده.',
}

export const STATUS_LABELS: Record<SessionStatus, string> = {
  draft: 'مسودة',
  open: 'مفتوحة',
  paused: 'متوقفة مؤقتًا',
  closed: 'مغلقة',
}

export const STATUS_STYLES: Record<SessionStatus, string> = {
  draft: 'bg-cream-200 text-muted',
  open: 'bg-olive-100 text-olive-800',
  paused: 'bg-gold-100 text-gold-700',
  closed: 'bg-stone-200 text-stone-700',
}

export const KIND_LABELS: Record<PostKind, string> = {
  opinion: 'رأي أو تفسير',
  quran: 'آية قرآنية',
  hadith: 'حديث نبوي',
  fiqh: 'دليل فقهي أو قاعدة شرعية',
  textbook: 'شاهد من الكتاب المدرسي',
  example: 'مثال من الواقع',
  rebuttal: 'رد أو تعقيب',
  question: 'سؤال يحتاج إلى توضيح',
  summary: 'خلاصة',
}

export const KIND_SHORT: Record<PostKind, string> = {
  opinion: 'رأي',
  quran: 'آية',
  hadith: 'حديث',
  fiqh: 'قاعدة شرعية',
  textbook: 'الكتاب المدرسي',
  example: 'مثال واقعي',
  rebuttal: 'تعقيب',
  question: 'سؤال',
  summary: 'خلاصة',
}

/** أنواع المشاركة التي يختارها الطالب (الخلاصة للمعلم وللطالب المكلف بالتلخيص) */
export const STUDENT_KINDS: PostKind[] = ['opinion', 'quran', 'hadith', 'fiqh', 'textbook', 'example', 'rebuttal', 'question', 'summary']

export const TAG_LABELS: Record<TeacherTag, string> = {
  good_evidence: 'دليل مناسب',
  needs_check: 'يحتاج إلى تحقق',
  incomplete: 'الاستدلال غير مكتمل',
  no_evidence: 'رأي بلا دليل',
  distinguished: 'مشاركة متميزة',
}

export const TAG_STYLES: Record<TeacherTag, string> = {
  good_evidence: 'bg-olive-100 text-olive-800',
  needs_check: 'bg-gold-100 text-gold-700',
  incomplete: 'bg-orange-100 text-orange-800',
  no_evidence: 'bg-stone-200 text-stone-700',
  distinguished: 'bg-gold-200 text-olive-900',
}

export const POLL_KIND_LABELS: Record<PollKind, string> = {
  single: 'اختيار واحد',
  multi: 'اختيارات متعددة',
  yesno: 'نعم / لا',
  scale: 'مقياس متدرج',
}

export const POLL_PHASE_LABELS: Record<PollPhase, string> = {
  general: 'تصويت عام',
  pre: 'قبل النقاش',
  post: 'بعد النقاش',
}

export const TEAM_COLORS: Record<TeamColor, { bg: string; border: string; text: string; dot: string }> = {
  olive: { bg: 'bg-olive-50', border: 'border-olive-300', text: 'text-olive-800', dot: 'bg-olive-600' },
  gold: { bg: 'bg-gold-50', border: 'border-gold-300', text: 'text-gold-700', dot: 'bg-gold-500' },
  teal: { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-800', dot: 'bg-teal-600' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-800', dot: 'bg-rose-600' },
  slate: { bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-800', dot: 'bg-slate-600' },
  sky: { bg: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-800', dot: 'bg-sky-600' },
}

export const AUDIT_LABELS: Record<string, string> = {
  session_create: 'إنشاء الجلسة',
  session_delete: 'حذف الجلسة',
  status_change: 'تغيير حالة الجلسة',
  mode_change: 'تغيير نمط النقاش',
  question_change: 'تغيير السؤال المحوري',
  settings_change: 'تعديل الإعدادات',
  post_approve: 'قبول مشاركة',
  post_reject: 'رفض مشاركة',
  post_delete: 'حذف مشاركة',
  member_approve: 'اعتماد دخول طالب',
  member_revoke: 'إخراج طالب',
  member_restore: 'إعادة طالب',
  member_role: 'تكليف بدور',
  points: 'تعديل النقاط',
  turn_grant: 'منح دور الحديث',
  stage_open: 'فتح مرحلة مناظرة',
  poll_open: 'فتح تصويت',
  poll_closed: 'إغلاق تصويت',
  poll_delete: 'حذف تصويت',
  timer_start: 'بدء المؤقت',
  timer_pause: 'إيقاف المؤقت',
  timer_resume: 'استئناف المؤقت',
  timer_end: 'إنهاء المؤقت',
  timer_add: 'تعديل وقت المؤقت',
  timer_reset: 'إعادة ضبط المؤقت',
  demo_seed: 'إنشاء بيانات تجريبية',
  class_delete: 'حذف صف',
  student_code_regenerate: 'تجديد رمز طالب',
  student_code_revoke: 'إبطال رمز طالب',
  student_code_restore: 'إعادة تفعيل رمز طالب',
  purge_sessions: 'حذف جلسات قديمة',
}

const timeFmt = new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat('ar', { dateStyle: 'medium' })
const dateTimeFmt = new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' })

export const fmtTime = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : '—')
export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—')
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '—')

export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
