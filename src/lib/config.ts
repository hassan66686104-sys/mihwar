// إعدادات البيئة: القيم العامة فقط (رابط المشروع والمفتاح العام). لا مفاتيح سرية في الواجهة.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''
export const IS_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
