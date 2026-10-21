import { Logo, Motto } from '../components/ui'

// تظهر عند تشغيل الموقع دون متغيرات البيئة: لا نعرض واجهة توهم بأن البيانات تُحفظ
export default function SetupRequired() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Logo size="lg" />
      <Motto className="mt-3" />
      <div className="card mt-8 p-6">
        <h1 className="mb-3 text-xl font-bold text-olive-800">الموقع غير مربوط بقاعدة البيانات بعد</h1>
        <p className="mb-4 text-muted">
          يحتاج «مِحْوَر» إلى مشروع Supabase لحفظ الجلسات والمشاركات ومزامنتها بين الأجهزة. لن تعمل الصفحات دون هذا الربط حتى لا تُفقد أي بيانات.
        </p>
        <ol className="list-decimal space-y-2 pe-5 text-sm">
          <li>أنشئ مشروع Supabase وطبّق ملفات المجلد <code dir="ltr">supabase/migrations</code> بالترتيب.</li>
          <li>
            انسخ <code dir="ltr">.env.example</code> إلى <code dir="ltr">.env.local</code> وضع فيه <code dir="ltr">VITE_SUPABASE_URL</code> و
            <code dir="ltr">VITE_SUPABASE_ANON_KEY</code>.
          </li>
          <li>أعد تشغيل الموقع. التفاصيل الكاملة في ملف README.</li>
        </ol>
      </div>
    </main>
  )
}
