-- =====================================================================
-- «مِحْوَر» — الملف 2: الدوال المساعدة والمحفزات (triggers)
-- =====================================================================

-- رفع خطأ برمز ثابت؛ الواجهة تترجم الرمز إلى رسالة عربية مفهومة
create or replace function public.mh_err(p_code text, p_detail text default '')
returns void language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = coalesce(p_detail, '');
end $$;

-- الإعدادات الافتراضية للجلسة
create or replace function public.mh_default_settings()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'join_mode', 'roster',              -- roster: قائمة الصف + رمز شخصي | approval: اسم يكتبه الطالب ويعتمده المعلم
    'allow_join_closed', false,          -- السماح بالدخول إلى جلسة مغلقة (للاطلاع فقط)
    'moderation', false,                 -- مراجعة المشاركات قبل ظهورها
    'posts_open', true,                  -- باب المشاركات
    'questions_open', true,              -- باب الأسئلة
    'replies_enabled', true,
    'reply_scope', 'all',                -- all | team
    'max_posts_per_student', 0,          -- 0 = بلا حد
    'max_replies_per_student', 0,
    'edit_window_sec', 120,              -- مهلة تعديل المشاركة (0 = لا تعديل)
    'show_own_history', true,
    'points_enabled', false,
    'show_points_to_students', false,
    'evidence_enabled', true,
    'hand_raise_enabled', true,
    'turn_seconds', 60,
    'turn_end_action', 'lock',           -- lock: يُغلق الإرسال | next: ينتقل الدور تلقائيًا
    'turn_posting', 'speaker_only',      -- speaker_only | all
    'auto_start_timer', true,
    'rubric', jsonb_build_array(
      jsonb_build_object('key','clarity','label','وضوح الفكرة'),
      jsonb_build_object('key','reasoning','label','جودة الاستدلال'),
      jsonb_build_object('key','relevance','label','صلة المشاركة بموضوع الدرس'),
      jsonb_build_object('key','listening','label','الاستماع إلى الرأي الآخر'),
      jsonb_build_object('key','etiquette','label','احترام آداب الحوار'),
      jsonb_build_object('key','openness','label','القدرة على تعديل الرأي بناءً على دليل')
    )
  )
$$;

create or replace function public.mh_settings(p_settings jsonb)
returns jsonb language sql immutable as $$
  select public.mh_default_settings() || coalesce(p_settings, '{}'::jsonb)
$$;

-- التحقق من الإعدادات المرسلة: مفاتيح معروفة وأنواع صحيحة ونطاقات معقولة
create or replace function public.mh_clean_settings(p jsonb)
returns jsonb language plpgsql immutable as $$
declare
  d jsonb := public.mh_default_settings();
  k text; v jsonb; n numeric; item jsonb;
begin
  if p is null then return '{}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then perform public.mh_err('MH_INVALID_INPUT', 'settings'); end if;
  for k, v in select * from jsonb_each(p) loop
    if not d ? k then perform public.mh_err('MH_INVALID_INPUT', 'unknown setting ' || k); end if;
    if jsonb_typeof(v) <> jsonb_typeof(d -> k) then perform public.mh_err('MH_INVALID_INPUT', 'bad type ' || k); end if;
    if jsonb_typeof(v) = 'number' then
      n := (v #>> '{}')::numeric;
      if n <> trunc(n) then perform public.mh_err('MH_INVALID_INPUT', k); end if;
      if k in ('max_posts_per_student','max_replies_per_student') and (n < 0 or n > 100) then perform public.mh_err('MH_INVALID_INPUT', k); end if;
      if k = 'edit_window_sec' and (n < 0 or n > 3600) then perform public.mh_err('MH_INVALID_INPUT', k); end if;
      if k = 'turn_seconds' and (n < 10 or n > 600) then perform public.mh_err('MH_INVALID_INPUT', k); end if;
    end if;
    if k = 'join_mode' and v #>> '{}' not in ('roster','approval') then perform public.mh_err('MH_INVALID_INPUT', k); end if;
    if k = 'reply_scope' and v #>> '{}' not in ('all','team') then perform public.mh_err('MH_INVALID_INPUT', k); end if;
    if k = 'turn_end_action' and v #>> '{}' not in ('lock','next') then perform public.mh_err('MH_INVALID_INPUT', k); end if;
    if k = 'turn_posting' and v #>> '{}' not in ('speaker_only','all') then perform public.mh_err('MH_INVALID_INPUT', k); end if;
    if k = 'rubric' then
      if jsonb_array_length(v) < 1 or jsonb_array_length(v) > 10 then perform public.mh_err('MH_INVALID_INPUT', k); end if;
      for item in select * from jsonb_array_elements(v) loop
        if jsonb_typeof(item) <> 'object'
           or coalesce(item ->> 'key', '') !~ '^[a-z0-9_]{1,40}$'
           or char_length(coalesce(item ->> 'label', '')) not between 2 and 80 then
          perform public.mh_err('MH_INVALID_INPUT', 'rubric');
        end if;
      end loop;
    end if;
  end loop;
  return p;
end $$;

-- رموز عشوائية من أبجدية بلا أحرف ملتبسة (بلا I وO و0 و1)
create or replace function public.mh_random_code(n int)
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for i in 1..n loop
    -- البايت الأول من UUID v4 عشوائي بالكامل؛ 256 تقبل القسمة على 32 فلا انحياز
    result := result || substr(alphabet, (get_byte(uuid_send(gen_random_uuid()), 0) % 32) + 1, 1);
  end loop;
  return result;
end $$;

create or replace function public.mh_new_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function public.mh_hash(p text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

-- حالة المؤقت الفعلية محسوبة من التوقيت المرجعي المحفوظ
create or replace function public.mh_timer_status(t public.mh_timers)
returns text language sql stable as $$
  select case when t.status = 'running' and t.ends_at <= now() then 'ended' else t.status end
$$;

create or replace function public.mh_timer_ended(p_session uuid, p_scope text)
returns boolean language sql stable as $$
  select coalesce((select public.mh_timer_status(t) = 'ended' from public.mh_timers t
                   where t.session_id = p_session and t.scope = p_scope), false)
$$;

create or replace function public.mh_timers_json(p_session uuid)
returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(t.scope, jsonb_build_object(
    'status', public.mh_timer_status(t),
    'duration_ms', t.duration_ms,
    'started_at', t.started_at,
    'ends_at', t.ends_at,
    'remaining_ms', t.remaining_ms)), '{}'::jsonb)
  from public.mh_timers t where t.session_id = p_session
$$;

-- ========================= المحفزات =========================

create or replace function public.mh_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['mh_profiles','mh_classes','mh_students','mh_sessions','mh_topics','mh_members',
                           'mh_teams','mh_debate_stages','mh_posts','mh_polls','mh_queue','mh_timers',
                           'mh_evaluations','mh_reports'] loop
    execute format('create or replace trigger mh_touch before update on public.%I for each row execute function public.mh_touch()', t);
  end loop;
end $$;

-- التحقق من صلاحية الانتقال بين حالات الجلسة
create or replace function public.mh_session_transition()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft'  and new.status in ('open','closed')) or
      (old.status = 'open'   and new.status in ('paused','closed')) or
      (old.status = 'paused' and new.status in ('open','closed')) or
      (old.status = 'closed' and new.status = 'open')
    ) then
      perform public.mh_err('MH_BAD_TRANSITION', old.status || '->' || new.status);
    end if;
    if new.status = 'open' and new.opened_at is null then new.opened_at := now(); end if;
    if new.status = 'closed' then new.closed_at := now(); end if;
    if new.status = 'open' and old.status = 'closed' then new.closed_at := null; end if;
  end if;
  return new;
end $$;
create or replace trigger mh_session_transition before update on public.mh_sessions
  for each row execute function public.mh_session_transition();

-- إبلاغ الأجهزة بالتغيير عبر Supabase Realtime (Broadcast).
-- الرسالة لا تحمل أي بيانات، بل اسم الجدول فقط؛ والأجهزة تعيد جلب الحالة عبر الدوال المحمية.
-- قاعدة البيانات هي مصدر الحقيقة، والتحديث الفوري وسيلة إبلاغ فقط.
create or replace function public.mh_notify()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  sid uuid;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_table_name = 'mh_sessions' then
    sid := r.id;
  elsif tg_table_name = 'mh_poll_ballots' then
    select p.session_id into sid from public.mh_polls p where p.id = r.poll_id;
  else
    sid := r.session_id;
  end if;
  if sid is not null then
    begin
      perform realtime.send(jsonb_build_object('t', tg_table_name), 'change', 'mh:' || sid::text, false);
    exception when others then
      null; -- فشل الإبلاغ لا يُفشل الحفظ؛ الأجهزة تعيد المزامنة دوريًا أيضًا
    end;
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['mh_sessions','mh_topics','mh_members','mh_teams','mh_team_members','mh_debate_stages',
                           'mh_posts','mh_polls','mh_poll_ballots','mh_queue','mh_timers','mh_points',
                           'mh_evaluations','mh_reports'] loop
    execute format('create or replace trigger mh_notify after insert or update or delete on public.%I for each row execute function public.mh_notify()', t);
  end loop;
end $$;

-- ========================= الهوية والصلاحيات =========================

-- المعلم: مستخدم Supabase Auth لديه ملف في mh_profiles
create or replace function public.mh_require_teacher()
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then perform public.mh_err('MH_NOT_AUTH'); end if;
  if not exists (select 1 from public.mh_profiles where id = uid) then perform public.mh_err('MH_NO_PROFILE'); end if;
  return uid;
end $$;

-- الجلسة يجب أن تكون ملكًا للمعلم الحالي؛ يقفل الصف لمنع السباقات
create or replace function public.mh_own_session(p_session uuid)
returns public.mh_sessions language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions; uid uuid := public.mh_require_teacher();
begin
  select * into s from public.mh_sessions where id = p_session for update;
  if not found or s.teacher_id <> uid then perform public.mh_err('MH_FORBIDDEN'); end if;
  return s;
end $$;

-- الطالب: يُعرَّف برمز جلسة شخصي (token) يُخزَّن مُجزّأً (hash) فقط
create or replace function public.mh_member_by_token(p_token text, p_allow_pending boolean default false)
returns public.mh_members language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.mh_members;
begin
  if p_token is null or char_length(p_token) <> 64 then perform public.mh_err('MH_TOKEN_INVALID'); end if;
  select * into m from public.mh_members where token_hash = public.mh_hash(p_token);
  if not found or m.token_expires_at < now() or m.status = 'revoked' then
    perform public.mh_err('MH_TOKEN_INVALID');
  end if;
  if m.status = 'pending' and not p_allow_pending then perform public.mh_err('MH_PENDING_APPROVAL'); end if;
  return m;
end $$;

create or replace function public.mh_log(p_teacher uuid, p_session uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.mh_audit(teacher_id, session_id, actor_name, action, details)
  values (p_teacher, p_session,
          coalesce((select display_name from public.mh_profiles where id = p_teacher), 'معلم'),
          p_action, coalesce(p_details, '{}'::jsonb));
end $$;

-- وقت الخادم لحساب فرق الساعة على كل جهاز
create or replace function public.mh_server_now()
returns timestamptz language sql stable as $$ select now() $$;

-- عرض المشاركة بصيغة JSON (مع الدليل وعدد الردود المقبولة)
create or replace function public.mh_post_json(p public.mh_posts, p_full boolean)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', p.id, 'parent_id', p.parent_id, 'topic_id', p.topic_id, 'member_id', p.member_id,
    'is_teacher', p.author_is_teacher, 'author_name', p.author_name, 'kind', p.kind, 'body', p.body,
    'status', p.status, 'pinned', p.pinned, 'replies_locked', p.replies_locked,
    'team_id', p.team_id, 'stage_id', p.stage_id,
    'created_at', p.created_at, 'edited_at', p.edited_at,
    'reply_count', (select count(*) from public.mh_posts c where c.parent_id = p.id and c.status = 'approved'),
    'evidence', (select to_jsonb(e) - 'post_id' - 'created_at' from public.mh_evidence e where e.post_id = p.id)
  ) || case when p_full then jsonb_build_object('teacher_tag', p.teacher_tag, 'teacher_note', p.teacher_note) else '{}'::jsonb end
$$;

-- إغلاق تنفيذ الدوال المساعدة حتى يطبَّق ملف الأمان (يُعاد منح الدوال العامة هناك)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'mh\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
