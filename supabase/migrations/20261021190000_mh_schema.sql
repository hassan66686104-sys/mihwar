-- =====================================================================
-- «مِحْوَر» — ساحة النقاش الصفّي للتربية الإسلامية
-- الملف 1: الجداول والقيود والفهارس
-- جميع الجداول تبدأ بالبادئة mh_ حتى لا تتعارض مع جداول أخرى في المشروع نفسه.
-- الملف قابل لإعادة التنفيذ (if not exists).
-- =====================================================================

-- ملفات المعلمين (الطلاب لا يملكون حسابات Supabase؛ يدخلون برموز شخصية)
create table if not exists public.mh_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- الصفوف والمجموعات
create table if not exists public.mh_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.mh_profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mh_classes_teacher_idx on public.mh_classes(teacher_id);

-- قائمة طلاب الصف (class_members) مع رمز دخول شخصي غير قابل للتخمين
create table if not exists public.mh_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.mh_classes(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 80),
  access_code text not null unique check (access_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  code_revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, full_name)
);
create index if not exists mh_students_class_idx on public.mh_students(class_id);

-- الجلسات
create table if not exists public.mh_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.mh_profiles(id) on delete cascade,
  class_id uuid references public.mh_classes(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  lesson text not null default '' check (char_length(lesson) <= 120),
  main_question text not null check (char_length(btrim(main_question)) between 3 and 500),
  instructions text not null default '' check (char_length(instructions) <= 1000),
  mode text not null default 'forum' check (mode in ('forum','debate','turns','poll')),
  status text not null default 'draft' check (status in ('draft','open','paused','closed')),
  join_code text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  duration_min int not null default 40 check (duration_min between 1 and 300),
  current_stage_id uuid,
  is_demo boolean not null default false,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mh_sessions_teacher_idx on public.mh_sessions(teacher_id, created_at desc);

-- محاور وأسئلة النقاش (discussion_topics)
create table if not exists public.mh_topics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mh_sessions(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mh_topics_session_idx on public.mh_topics(session_id, position);

-- المشاركون في الجلسة (session_members)
create table if not exists public.mh_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mh_sessions(id) on delete cascade,
  student_id uuid references public.mh_students(id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  status text not null default 'active' check (status in ('pending','active','revoked')),
  role_label text check (char_length(role_label) <= 40),
  teacher_note text not null default '' check (char_length(teacher_note) <= 1000),
  overall_grade text not null default '' check (char_length(overall_grade) <= 30),
  token_hash text unique,
  token_expires_at timestamptz,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id),
  unique (session_id, display_name)
);
create index if not exists mh_members_session_idx on public.mh_members(session_id);

-- الفرق
create table if not exists public.mh_teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mh_sessions(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default 'olive' check (color in ('olive','gold','teal','rose','slate','sky')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, name)
);
create table if not exists public.mh_team_members (
  session_id uuid not null references public.mh_sessions(id) on delete cascade,
  member_id uuid not null references public.mh_members(id) on delete cascade,
  team_id uuid not null references public.mh_teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, member_id)
);
create index if not exists mh_team_members_team_idx on public.mh_team_members(team_id);

-- مراحل المناظرة
create table if not exists public.mh_debate_stages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mh_sessions(id) on delete cascade,
  position int not null default 0,
  team_id uuid references public.mh_teams(id) on delete set null,
  label text not null check (char_length(btrim(label)) between 2 and 80),
  duration_sec int not null default 180 check (duration_sec between 10 and 3600),
  max_posts_per_team int not null default 0 check (max_posts_per_team between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mh_stages_session_idx on public.mh_debate_stages(session_id, position);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mh_sessions_current_stage_fk') then
    alter table public.mh_sessions add constraint mh_sessions_current_stage_fk
      foreign key (current_stage_id) references public.mh_debate_stages(id) on delete set null;
  end if;
end $$;

-- المشاركات والردود في جدول واحد: parent_id يربط الرد بالمشاركة الأصلية
create table if not exists public.mh_posts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mh_sessions(id) on delete cascade,
  topic_id uuid references public.mh_topics(id) on delete set null,
  parent_id uuid references public.mh_posts(id) on delete cascade,
  member_id uuid references public.mh_members(id) on delete cascade,
  author_is_teacher boolean not null default false,
  author_name text not null check (char_length(author_name) between 1 and 80),
  kind text not null check (kind in ('opinion','quran','hadith','fiqh','textbook','example','rebuttal','question','summary')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  pinned boolean not null default false,
  replies_locked boolean not null default false,
  team_id uuid references public.mh_teams(id) on delete set null,
  stage_id uuid references public.mh_debate_stages(id) on delete set null,
  teacher_tag text check (teacher_tag in ('good_evidence','needs_check','incomplete','no_evidence','distinguished')),
  teacher_note text not null default '' check (char_length(teacher_note) <= 500),
  client_id uuid not null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, client_id),
  check (author_is_teacher or member_id is not null)
);
create index if not exists mh_posts_session_idx on public.mh_posts(session_id, created_at desc);
create index if not exists mh_posts_parent_idx on public.mh_posts(parent_id);
create index if not exists mh_posts_member_idx on public.mh_posts(member_id);

-- الأدلة والشواهد (حقول المصدر اختيارية)
create table if not exists public.mh_evidence (
  post_id uuid primary key references public.mh_posts(id) on delete cascade,
  source_type text not null check (source_type in ('quran','hadith','fiqh','textbook','example','other')),
  quote text not null default '' check (char_length(quote) <= 2000),
  surah text not null default '' check (char_length(surah) <= 40),
  ayah text not null default '' check (char_length(ayah) <= 20),
  hadith_source text not null default '' check (char_length(hadith_source) <= 120),
  hadith_grade text not null default '' check (char_length(hadith_grade) <= 60),
  book_title text not null default '' check (char_length(book_title) <= 160),
  page text not null default '' check (char_length(page) <= 20),
  reasoning text not null default '' check (char_length(reasoning) <= 1000),
  url text not null default '' check (url = '' or (url ~* '^https?://' and char_length(url) <= 500)),
  created_at timestamptz not null default now()
);

-- التصويت
create table if not exists public.mh_polls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mh_sessions(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 2 and 300),
  kind text not null check (kind in ('single','multi','yesno','scale')),
  phase text not null default 'general' check (phase in ('general','pre','post')),
  show_voters boolean not null default false,
  hide_results boolean not null default true,
  max_choices int not null default 1 check (max_choices between 1 and 10),
  status text not null default 'draft' check (status in ('draft','open','closed')),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mh_polls_session_idx on public.mh_polls(session_id, created_at);
create table if not exists public.mh_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.mh_polls(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  position int not null,
  unique (poll_id, position)
);
-- بطاقة اقتراع واحدة لكل طالب في كل تصويت: المفتاح الأساسي يمنع التكرار على مستوى قاعدة البيانات
create table if not exists public.mh_poll_ballots (
  poll_id uuid not null references public.mh_polls(id) on delete cascade,
  member_id uuid not null references public.mh_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, member_id)
);
create table if not exists public.mh_poll_votes (
  poll_id uuid not null,
  member_id uuid not null,
  option_id uuid not null references public.mh_poll_options(id) on delete cascade,
  primary key (poll_id, member_id, option_id),
  foreign key (poll_id, member_id) references public.mh_poll_ballots(poll_id, member_id) on delete cascade
);

-- قائمة طلب الحديث: الترتيب مركزي عبر تسلسل seq في قاعدة البيانات
create table if not exists public.mh_queue (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mh_sessions(id) on delete cascade,
  member_id uuid not null references public.mh_members(id) on delete cascade,
  seq bigint generated always as identity,
  status text not null default 'waiting' check (status in ('waiting','speaking','done','skipped','withdrawn')),
  requested_at timestamptz not null default now(),
  granted_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists mh_queue_one_active_per_member on public.mh_queue(session_id, member_id) where status in ('waiting','speaking');
create unique index if not exists mh_queue_one_speaker on public.mh_queue(session_id) where status = 'speaking';
create index if not exists mh_queue_session_idx on public.mh_queue(session_id, seq);

-- المؤقت المركزي: يُخزَّن وقت البداية والنهاية والحالة، وكل جهاز يحسب المتبقي منها
create table if not exists public.mh_timers (
  session_id uuid not null references public.mh_sessions(id) on delete cascade,
  scope text not null check (scope in ('session','stage','turn')),
  status text not null default 'idle' check (status in ('idle','running','paused','ended')),
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  started_at timestamptz,
  ends_at timestamptz,
  remaining_ms bigint check (remaining_ms >= 0),
  updated_at timestamptz not null default now(),
  primary key (session_id, scope)
);

-- تقييمات المعلم وفق السلّم (1–4 أو null = لم يُقيّم)
create table if not exists public.mh_evaluations (
  session_id uuid not null references public.mh_sessions(id) on delete cascade,
  member_id uuid not null references public.mh_members(id) on delete cascade,
  criterion text not null check (criterion ~ '^[a-z0-9_]{1,40}$'),
  score smallint check (score between 1 and 4),
  updated_at timestamptz not null default now(),
  primary key (session_id, member_id, criterion)
);

-- النقاط (اختيارية)
create table if not exists public.mh_points (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mh_sessions(id) on delete cascade,
  member_id uuid not null references public.mh_members(id) on delete cascade,
  delta int not null check (delta between -10 and 10 and delta <> 0),
  reason text not null default '' check (char_length(reason) <= 120),
  post_id uuid references public.mh_posts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists mh_points_member_idx on public.mh_points(member_id);

-- التقارير المحفوظة
create table if not exists public.mh_reports (
  session_id uuid primary key references public.mh_sessions(id) on delete cascade,
  data jsonb not null,
  teacher_summary text not null default '' check (char_length(teacher_summary) <= 4000),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- سجل التدقيق: يبقى بعد حذف الجلسة (يحذف مع حساب المعلم)
create table if not exists public.mh_audit (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.mh_profiles(id) on delete cascade,
  session_id uuid,
  actor_name text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists mh_audit_session_idx on public.mh_audit(session_id, created_at desc);
create index if not exists mh_audit_teacher_idx on public.mh_audit(teacher_id, created_at desc);

-- محاولات الدخول (لتحديد المعدل ومنع تخمين الرموز)
create table if not exists public.mh_join_attempts (
  id bigint generated always as identity primary key,
  session_id uuid references public.mh_sessions(id) on delete cascade,
  student_id uuid,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists mh_join_attempts_idx on public.mh_join_attempts(session_id, created_at desc);

-- تفعيل RLS فورًا (السياسات التفصيلية في ملف الأمان) حتى لا تبقى الجداول مكشوفة بين الملفات
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'mh\_%' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
