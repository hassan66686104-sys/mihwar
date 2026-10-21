// ترجمة رموز الأخطاء القادمة من قاعدة البيانات إلى رسائل عربية مفهومة للطلاب والمعلم

const MESSAGES: Record<string, string> = {
  MH_NETWORK: 'تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.',
  MH_NOT_CONFIGURED: 'لم يُربط الموقع بقاعدة البيانات بعد.',
  MH_NOT_AUTH: 'يلزم تسجيل الدخول للمتابعة.',
  MH_NO_PROFILE: 'أكمل بيانات حسابك (الاسم) للمتابعة.',
  MH_FORBIDDEN: 'لا تملك صلاحية الوصول إلى هذه الصفحة أو الجلسة.',
  MH_NOT_FOUND: 'العنصر المطلوب غير موجود أو حُذف.',
  MH_BAD_CODE: 'رمز الجلسة غير صحيح. تأكّد منه واطلبه من المعلم إن لزم.',
  MH_BAD_CREDENTIALS: 'رمز الدخول الشخصي غير صحيح لهذا الاسم.',
  MH_NAME_TAKEN: 'هذا الاسم مستخدم في الجلسة. إن كان اسمك فاطلب من المعلم المساعدة.',
  MH_REVOKED: 'أوقف المعلم دخولك إلى هذه الجلسة.',
  MH_RATE_LIMIT: 'محاولات كثيرة متتالية. انتظر قليلًا ثم أعد المحاولة.',
  MH_SESSION_NOT_STARTED: 'لم يفتح المعلم الجلسة بعد.',
  MH_SESSION_CLOSED: 'الجلسة مغلقة، ولا يمكن المشاركة الآن.',
  MH_SESSION_PAUSED: 'الجلسة متوقفة مؤقتًا. انتظر حتى يستأنفها المعلم.',
  MH_TIME_UP: 'انتهى وقت المشاركة.',
  MH_POSTS_CLOSED: 'أغلق المعلم باب المشاركات الآن.',
  MH_QUESTIONS_CLOSED: 'أغلق المعلم باب الأسئلة الآن.',
  MH_REPLIES_CLOSED: 'الردود مغلقة على هذه المشاركة.',
  MH_LIMIT_REACHED: 'بلغت الحد الأقصى للمشاركات المسموح به.',
  MH_NOT_YOUR_TURN: 'ليس دورك في الحديث الآن. اطلب الحديث وانتظر أن يمنحك المعلم الدور.',
  MH_NOT_YOUR_STAGE: 'هذه المرحلة مخصصة لفريق آخر.',
  MH_STAGE_NOT_OPEN: 'لم يفتح المعلم مرحلة المناظرة بعد.',
  MH_NOT_ALLOWED: 'لم يسمح المعلم بهذا الإجراء.',
  MH_EVIDENCE_DISABLED: 'أوقف المعلم إرفاق الأدلة في هذه الجلسة.',
  MH_EDIT_EXPIRED: 'انتهت مهلة تعديل هذه المشاركة.',
  MH_ALREADY_VOTED: 'سجّلتَ صوتك في هذا التصويت مسبقًا.',
  MH_POLL_CLOSED: 'التصويت مغلق.',
  MH_TOKEN_INVALID: 'انتهت صلاحية دخولك إلى الجلسة. ادخل مرة أخرى برمز الجلسة ورمزك الشخصي.',
  MH_PENDING_APPROVAL: 'طلب دخولك بانتظار موافقة المعلم.',
  MH_INVALID_INPUT: 'البيانات المدخلة غير مكتملة أو غير صالحة.',
  MH_BAD_TRANSITION: 'لا يمكن الانتقال إلى هذه الحالة من الحالة الحالية.',
  MH_NEED_TEAMS: 'المناظرة تحتاج إلى فريقين على الأقل. أنشئ الفرق أولًا.',
  MH_NO_NEXT_STAGE: 'لا توجد مرحلة تالية.',
  MH_POINTS_DISABLED: 'نظام النقاط غير مفعّل في هذه الجلسة.',
  MH_ROSTER_NEEDS_CLASS: 'الدخول بقائمة الصف يتطلب اختيار صف.',
  MH_CLASS_LOCKED: 'لا يمكن تغيير الصف بعد فتح الجلسة.',
  MH_REPORT_FAILED: 'تعذّر إنشاء التقرير. أعد المحاولة.',
  MH_NOT_ENOUGH: 'لا توجد مشاركات كافية لإنشاء ملخص مفيد.',
  MH_LOGIN_FAILED: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  MH_EMAIL_UNCONFIRMED: 'لم يُؤكَّد البريد الإلكتروني بعد. افتح رسالة التأكيد في بريدك.',
  MH_EMAIL_TAKEN: 'هذا البريد مسجّل مسبقًا. جرّب تسجيل الدخول.',
  MH_WEAK_PASSWORD: 'كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل.',
  MH_SIGNUP_FAILED: 'تعذّر إنشاء الحساب. أعد المحاولة لاحقًا.',
  MH_UNKNOWN: 'حدث خطأ غير متوقع. أعد المحاولة.',
}

export class AppError extends Error {
  code: string
  constructor(code: string, raw?: string) {
    super(MESSAGES[code] ?? MESSAGES.MH_UNKNOWN)
    this.code = code
    if (raw) this.cause = raw
  }
}

export function messageFor(code: string): string {
  return MESSAGES[code] ?? MESSAGES.MH_UNKNOWN
}

/** يحوّل أي خطأ (من Supabase أو الشبكة) إلى AppError برمز معروف */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e
  const msg = String((e as { message?: string })?.message ?? e ?? '')
  const m = msg.match(/MH_[A-Z_]+/)
  if (m && MESSAGES[m[0]]) return new AppError(m[0], msg)
  if (/fetch|network|Failed to fetch|NetworkError|Load failed|timeout/i.test(msg)) return new AppError('MH_NETWORK', msg)
  if (/JWT|jwt|token/i.test(msg)) return new AppError('MH_NOT_AUTH', msg)
  return new AppError('MH_UNKNOWN', msg)
}

export function isNetworkError(e: unknown): boolean {
  return toAppError(e).code === 'MH_NETWORK'
}
