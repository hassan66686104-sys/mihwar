-- =====================================================================
-- «مِحْوَر» — الملف 3: دوال المعلم (كلها تتحقق من auth.uid() وملكية الجلسة)
-- =====================================================================

-- ------------------------- المؤقت (داخلية) -------------------------
create or replace function public.mh_timer_start(p_session uuid, p_scope text, p_ms bigint)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.mh_timers(session_id, scope, status, duration_ms, started_at, ends_at, remaining_ms)
  values (p_session, p_scope, 'running', p_ms, now(), now() + make_interval(secs => p_ms / 1000.0), null)
  on conflict (session_id, scope) do update
    set status = 'running', duration_ms = excluded.duration_ms, started_at = excluded.started_at,
        ends_at = excluded.ends_at, remaining_ms = null
$$;

create or replace function public.mh_timer_pause(p_session uuid, p_scope text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.mh_timers
     set status = 'paused',
         remaining_ms = greatest(0, (extract(epoch from (ends_at - now())) * 1000)::bigint)
   where session_id = p_session and scope = p_scope and status = 'running' and ends_at > now()
$$;

create or replace function public.mh_timer_resume(p_session uuid, p_scope text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.mh_timers
     set status = 'running', ends_at = now() + make_interval(secs => coalesce(remaining_ms, 0) / 1000.0), remaining_ms = null
   where session_id = p_session and scope = p_scope and status = 'paused'
$$;

create or replace function public.mh_timer_end(p_session uuid, p_scope text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.mh_timers
     set status = 'ended', ends_at = least(coalesce(ends_at, now()), now()), remaining_ms = 0
   where session_id = p_session and scope = p_scope and status in ('running','paused')
$$;

create or replace function public.mh_timer_add(p_session uuid, p_scope text, p_ms bigint)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.mh_timers
     set duration_ms = greatest(0, duration_ms + p_ms),
         status = case when status = 'ended' then 'running' else status end,
         ends_at = case when status = 'paused' then ends_at
                        else greatest(ends_at, now()) + make_interval(secs => p_ms / 1000.0) end,
         remaining_ms = case when status = 'paused' then greatest(0, remaining_ms + p_ms) else null end
   where session_id = p_session and scope = p_scope and status in ('running','paused','ended')
$$;

-- --------------------------- الملف الشخصي ---------------------------
create or replace function public.mh_teacher_bootstrap(p_display_name text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); prof public.mh_profiles;
begin
  if uid is null then perform public.mh_err('MH_NOT_AUTH'); end if;
  select * into prof from public.mh_profiles where id = uid;
  if not found then
    if p_display_name is null or char_length(btrim(p_display_name)) < 2 then
      perform public.mh_err('MH_NO_PROFILE');
    end if;
    insert into public.mh_profiles(id, display_name) values (uid, btrim(p_display_name)) returning * into prof;
  elsif p_display_name is not null and char_length(btrim(p_display_name)) >= 2 then
    update public.mh_profiles set display_name = btrim(p_display_name) where id = uid returning * into prof;
  end if;
  return jsonb_build_object('id', prof.id, 'display_name', prof.display_name);
end $$;

create or replace function public.mh_teacher_home()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.mh_require_teacher();
begin
  return jsonb_build_object(
    'profile', (select jsonb_build_object('id', id, 'display_name', display_name) from public.mh_profiles where id = uid),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'is_demo', c.is_demo,
                         'student_count', (select count(*) from public.mh_students s where s.class_id = c.id))
                       order by c.created_at)
      from public.mh_classes c where c.teacher_id = uid), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'lesson', s.lesson, 'mode', s.mode, 'status', s.status,
               'join_code', s.join_code, 'is_demo', s.is_demo, 'class_name', c.name,
               'created_at', s.created_at, 'opened_at', s.opened_at, 'closed_at', s.closed_at,
               'member_count', (select count(*) from public.mh_members m where m.session_id = s.id and m.status = 'active'),
               'post_count', (select count(*) from public.mh_posts p where p.session_id = s.id and p.status = 'approved'),
               'has_report', exists (select 1 from public.mh_reports r where r.session_id = s.id))
             order by s.created_at desc)
      from public.mh_sessions s left join public.mh_classes c on c.id = s.class_id
      where s.teacher_id = uid), '[]'::jsonb)
  );
end $$;

-- ------------------------------ الصفوف ------------------------------
create or replace function public.mh_own_class(p_class uuid)
returns public.mh_classes language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.mh_classes; uid uuid := public.mh_require_teacher();
begin
  select * into c from public.mh_classes where id = p_class;
  if not found or c.teacher_id <> uid then perform public.mh_err('MH_FORBIDDEN'); end if;
  return c;
end $$;

create or replace function public.mh_class_save(p_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.mh_require_teacher(); cid uuid;
begin
  if p_id is null then
    insert into public.mh_classes(teacher_id, name) values (uid, btrim(p_name)) returning id into cid;
  else
    perform public.mh_own_class(p_id);
    update public.mh_classes set name = btrim(p_name) where id = p_id returning id into cid;
  end if;
  return cid;
end $$;

create or replace function public.mh_class_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.mh_classes := public.mh_own_class(p_id);
begin
  perform public.mh_log(c.teacher_id, null, 'class_delete', jsonb_build_object('name', c.name));
  delete from public.mh_classes where id = p_id;
end $$;

create or replace function public.mh_class_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.mh_classes := public.mh_own_class(p_id);
begin
  return jsonb_build_object(
    'class', jsonb_build_object('id', c.id, 'name', c.name, 'is_demo', c.is_demo),
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'full_name', s.full_name,
                     'access_code', s.access_code, 'code_revoked', s.code_revoked) order by s.full_name)
                   from public.mh_students s where s.class_id = p_id), '[]'::jsonb));
end $$;

create or replace function public.mh_insert_student(p_class uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid; tries int := 0;
begin
  loop
    begin
      insert into public.mh_students(class_id, full_name, access_code)
      values (p_class, btrim(regexp_replace(p_name, '\s+', ' ', 'g')), public.mh_random_code(8))
      on conflict (class_id, full_name) do nothing
      returning id into sid;
      return sid;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;
end $$;

create or replace function public.mh_students_add(p_class uuid, p_names text[])
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare n text; added int := 0;
begin
  perform public.mh_own_class(p_class);
  if coalesce(array_length(p_names, 1), 0) > 200 then perform public.mh_err('MH_INVALID_INPUT', 'too many'); end if;
  foreach n in array coalesce(p_names, '{}') loop
    if char_length(btrim(n)) >= 2 then
      if public.mh_insert_student(p_class, n) is not null then added := added + 1; end if;
    end if;
  end loop;
  return added;
end $$;

create or replace function public.mh_own_student(p_id uuid)
returns public.mh_students language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_students;
begin
  select * into s from public.mh_students where id = p_id;
  if not found then perform public.mh_err('MH_FORBIDDEN'); end if;
  perform public.mh_own_class(s.class_id);
  return s;
end $$;

create or replace function public.mh_student_update(p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.mh_own_student(p_id);
  update public.mh_students set full_name = btrim(p_name) where id = p_id;
end $$;

-- إبطال رمز الطالب أو تجديده: يُخرج أي جهاز دخل بالرمز القديم
create or replace function public.mh_student_code(p_id uuid, p_action text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_students := public.mh_own_student(p_id); c public.mh_classes; code text;
begin
  select * into c from public.mh_classes where id = s.class_id;
  if p_action = 'regenerate' then
    loop
      code := public.mh_random_code(8);
      exit when not exists (select 1 from public.mh_students where access_code = code);
    end loop;
    update public.mh_students set access_code = code, code_revoked = false where id = p_id;
  elsif p_action = 'revoke' then
    update public.mh_students set code_revoked = true where id = p_id;
  elsif p_action = 'restore' then
    update public.mh_students set code_revoked = false where id = p_id;
  else
    perform public.mh_err('MH_INVALID_INPUT', 'action');
  end if;
  if p_action in ('regenerate','revoke') then
    update public.mh_members set token_hash = null, token_expires_at = null where student_id = p_id;
  end if;
  perform public.mh_log(c.teacher_id, null, 'student_code_' || p_action, jsonb_build_object('student', s.full_name));
  return (select access_code from public.mh_students where id = p_id);
end $$;

create or replace function public.mh_student_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.mh_own_student(p_id);
  delete from public.mh_students where id = p_id;
end $$;

-- ------------------------------ الجلسات ------------------------------
create or replace function public.mh_session_create(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := public.mh_require_teacher();
  sid uuid; code text; t jsonb; i int := 0; st jsonb;
  cls uuid := nullif(p ->> 'class_id', '')::uuid;
begin
  if cls is not null then perform public.mh_own_class(cls); end if;
  st := public.mh_clean_settings(coalesce(p -> 'settings', '{}'::jsonb));
  if public.mh_settings(st) ->> 'join_mode' = 'roster' and cls is null then
    perform public.mh_err('MH_ROSTER_NEEDS_CLASS');
  end if;
  loop
    code := public.mh_random_code(6);
    exit when not exists (select 1 from public.mh_sessions where join_code = code);
  end loop;
  insert into public.mh_sessions(teacher_id, class_id, title, lesson, main_question, instructions, mode, duration_min, settings, join_code, is_demo)
  values (uid, cls, btrim(p ->> 'title'), btrim(coalesce(p ->> 'lesson', '')), btrim(p ->> 'main_question'),
          btrim(coalesce(p ->> 'instructions', '')), coalesce(p ->> 'mode', 'forum'),
          coalesce((p ->> 'duration_min')::int, 40), st, code, coalesce((p ->> 'is_demo')::boolean, false))
  returning id into sid;
  for t in select * from jsonb_array_elements(coalesce(p -> 'topics', '[]'::jsonb)) loop
    if char_length(btrim(coalesce(t ->> 'title', ''))) >= 2 then
      insert into public.mh_topics(session_id, title, body, position)
      values (sid, btrim(t ->> 'title'), btrim(coalesce(t ->> 'body', '')), i);
      i := i + 1;
    end if;
  end loop;
  i := 0;
  for t in select * from jsonb_array_elements(coalesce(p -> 'teams', '[]'::jsonb)) loop
    if char_length(btrim(coalesce(t #>> '{}', ''))) >= 1 then
      insert into public.mh_teams(session_id, name, color, position)
      values (sid, btrim(t #>> '{}'), (array['olive','gold','teal','rose','slate','sky'])[(i % 6) + 1], i);
      i := i + 1;
    end if;
  end loop;
  if i >= 2 then perform public.mh_debate_default_stages_internal(sid); end if;
  perform public.mh_log(uid, sid, 'session_create', jsonb_build_object('title', p ->> 'title'));
  return jsonb_build_object('id', sid, 'join_code', code);
end $$;

-- مراحل المناظرة الافتراضية: حجة ← رد ← تعقيب ← تعقيب أخير ← خلاصة المعلم
create or replace function public.mh_debate_default_stages_internal(p_session uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare a uuid; b uuid;
begin
  select id into a from public.mh_teams where session_id = p_session order by position, created_at limit 1;
  select id into b from public.mh_teams where session_id = p_session order by position, created_at offset 1 limit 1;
  if a is null or b is null then perform public.mh_err('MH_NEED_TEAMS'); end if;
  delete from public.mh_debate_stages where session_id = p_session;
  insert into public.mh_debate_stages(session_id, position, team_id, label, duration_sec, max_posts_per_team) values
    (p_session, 0, a, 'الحجة الأولى', 180, 3),
    (p_session, 1, b, 'الرد على الحجة', 180, 3),
    (p_session, 2, a, 'التعقيب', 120, 2),
    (p_session, 3, b, 'التعقيب الأخير', 120, 2),
    (p_session, 4, null, 'خلاصة المعلم', 120, 0);
end $$;

create or replace function public.mh_session_update(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_id); st jsonb; cls uuid;
begin
  if p ? 'class_id' then
    cls := nullif(p ->> 'class_id', '')::uuid;
    if cls is distinct from s.class_id then
      if s.status <> 'draft' then perform public.mh_err('MH_CLASS_LOCKED'); end if;
      if cls is not null then perform public.mh_own_class(cls); end if;
    end if;
  else
    cls := s.class_id;
  end if;
  st := s.settings || public.mh_clean_settings(coalesce(p -> 'settings', '{}'::jsonb));
  if public.mh_settings(st) ->> 'join_mode' = 'roster' and cls is null then
    perform public.mh_err('MH_ROSTER_NEEDS_CLASS');
  end if;
  update public.mh_sessions set
    title = coalesce(btrim(p ->> 'title'), title),
    lesson = coalesce(btrim(p ->> 'lesson'), lesson),
    main_question = coalesce(btrim(p ->> 'main_question'), main_question),
    instructions = coalesce(btrim(p ->> 'instructions'), instructions),
    duration_min = coalesce((p ->> 'duration_min')::int, duration_min),
    class_id = cls,
    settings = st
  where id = p_id;
  if p ? 'main_question' and (p ->> 'main_question') is distinct from s.main_question then
    perform public.mh_log(s.teacher_id, p_id, 'question_change', jsonb_build_object('from', s.main_question, 'to', p ->> 'main_question'));
  end if;
  if p ? 'settings' then
    perform public.mh_log(s.teacher_id, p_id, 'settings_change', p -> 'settings');
  end if;
end $$;

create or replace function public.mh_session_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_id);
begin
  perform public.mh_log(s.teacher_id, p_id, 'session_delete', jsonb_build_object('title', s.title));
  delete from public.mh_sessions where id = p_id;
end $$;

create or replace function public.mh_session_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_id); sc text;
begin
  if p_status = s.status then return; end if;
  update public.mh_sessions set status = p_status where id = p_id; -- المحفز يتحقق من صلاحية الانتقال
  if p_status = 'open' and s.status in ('draft','closed') then
    if (public.mh_settings(s.settings) ->> 'auto_start_timer')::boolean
       and not exists (select 1 from public.mh_timers where session_id = p_id and scope = 'session' and status in ('running','paused')) then
      perform public.mh_timer_start(p_id, 'session', s.duration_min * 60000::bigint);
    end if;
  elsif p_status = 'paused' then
    foreach sc in array array['session','stage','turn'] loop perform public.mh_timer_pause(p_id, sc); end loop;
  elsif p_status = 'open' and s.status = 'paused' then
    foreach sc in array array['session','stage','turn'] loop perform public.mh_timer_resume(p_id, sc); end loop;
  elsif p_status = 'closed' then
    foreach sc in array array['session','stage','turn'] loop perform public.mh_timer_end(p_id, sc); end loop;
    update public.mh_queue set status = 'done', ended_at = now() where session_id = p_id and status = 'speaking';
    update public.mh_queue set status = 'skipped', ended_at = now() where session_id = p_id and status = 'waiting';
    update public.mh_polls set status = 'closed', closed_at = now() where session_id = p_id and status = 'open';
  end if;
  perform public.mh_log(s.teacher_id, p_id, 'status_change', jsonb_build_object('from', s.status, 'to', p_status));
  if p_status = 'closed' then perform public.mh_report_build(p_id); end if;
end $$;

create or replace function public.mh_session_set_mode(p_id uuid, p_mode text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_id);
begin
  if p_mode not in ('forum','debate','turns','poll') then perform public.mh_err('MH_INVALID_INPUT', 'mode'); end if;
  if p_mode = s.mode then return; end if;
  if s.status = 'closed' then perform public.mh_err('MH_SESSION_CLOSED'); end if;
  if p_mode = 'debate' and (select count(*) from public.mh_teams where session_id = p_id) < 2 then
    perform public.mh_err('MH_NEED_TEAMS');
  end if;
  if s.mode = 'turns' then
    update public.mh_queue set status = 'done', ended_at = now() where session_id = p_id and status = 'speaking';
    perform public.mh_timer_end(p_id, 'turn');
  end if;
  if s.mode = 'debate' then
    perform public.mh_timer_end(p_id, 'stage');
  end if;
  if p_mode = 'debate' and not exists (select 1 from public.mh_debate_stages where session_id = p_id) then
    perform public.mh_debate_default_stages_internal(p_id);
  end if;
  update public.mh_sessions set mode = p_mode where id = p_id;
  perform public.mh_log(s.teacher_id, p_id, 'mode_change', jsonb_build_object('from', s.mode, 'to', p_mode));
end $$;

create or replace function public.mh_timer_control(p_session uuid, p_scope text, p_action text, p_seconds int default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_session);
begin
  if p_scope not in ('session','stage','turn') then perform public.mh_err('MH_INVALID_INPUT', 'scope'); end if;
  if p_action = 'start' then
    if p_seconds is null or p_seconds not between 5 and 18000 then perform public.mh_err('MH_INVALID_INPUT', 'seconds'); end if;
    perform public.mh_timer_start(p_session, p_scope, p_seconds * 1000::bigint);
  elsif p_action = 'pause' then perform public.mh_timer_pause(p_session, p_scope);
  elsif p_action = 'resume' then perform public.mh_timer_resume(p_session, p_scope);
  elsif p_action = 'end' then perform public.mh_timer_end(p_session, p_scope);
  elsif p_action = 'add' then
    if p_seconds is null or p_seconds not between -3600 and 3600 then perform public.mh_err('MH_INVALID_INPUT', 'seconds'); end if;
    perform public.mh_timer_add(p_session, p_scope, p_seconds * 1000::bigint);
    if p_scope = 'turn' then
      update public.mh_queue q set ends_at = t.ends_at
        from public.mh_timers t
       where q.session_id = p_session and q.status = 'speaking' and t.session_id = p_session and t.scope = 'turn';
    end if;
  elsif p_action = 'reset' then
    update public.mh_timers set status = 'idle', started_at = null, ends_at = null, remaining_ms = null
     where session_id = p_session and scope = p_scope;
  else
    perform public.mh_err('MH_INVALID_INPUT', 'action');
  end if;
  perform public.mh_log(s.teacher_id, p_session, 'timer_' || p_action, jsonb_build_object('scope', p_scope, 'seconds', p_seconds));
end $$;

-- ------------------------------ المحاور ------------------------------
create or replace function public.mh_topic_save(p_session uuid, p_id uuid, p_title text, p_body text default '')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid;
begin
  perform public.mh_own_session(p_session);
  if p_id is null then
    insert into public.mh_topics(session_id, title, body, position)
    values (p_session, btrim(p_title), btrim(coalesce(p_body, '')),
            coalesce((select max(position) + 1 from public.mh_topics where session_id = p_session), 0))
    returning id into tid;
  else
    update public.mh_topics set title = btrim(p_title), body = btrim(coalesce(p_body, ''))
     where id = p_id and session_id = p_session returning id into tid;
    if tid is null then perform public.mh_err('MH_NOT_FOUND'); end if;
  end if;
  return tid;
end $$;

create or replace function public.mh_topic_set(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.mh_topics;
begin
  select * into t from public.mh_topics where id = p_id;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  perform public.mh_own_session(t.session_id);
  if p_action = 'activate' then update public.mh_topics set is_active = true where id = p_id;
  elsif p_action = 'deactivate' then update public.mh_topics set is_active = false where id = p_id;
  elsif p_action = 'delete' then delete from public.mh_topics where id = p_id;
  else perform public.mh_err('MH_INVALID_INPUT', 'action'); end if;
end $$;

-- ---------------------------- المشاركات ----------------------------
create or replace function public.mh_post_moderate(p_post uuid, p_action text, p_value text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.mh_posts; s public.mh_sessions;
begin
  select * into p from public.mh_posts where id = p_post;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  s := public.mh_own_session(p.session_id);
  case p_action
    when 'approve' then update public.mh_posts set status = 'approved' where id = p_post;
    when 'reject' then update public.mh_posts set status = 'rejected', pinned = false where id = p_post;
    when 'delete' then delete from public.mh_posts where id = p_post;
    when 'pin' then update public.mh_posts set pinned = true where id = p_post;
    when 'unpin' then update public.mh_posts set pinned = false where id = p_post;
    when 'lock' then update public.mh_posts set replies_locked = true where id = p_post;
    when 'unlock' then update public.mh_posts set replies_locked = false where id = p_post;
    when 'tag' then
      if nullif(p_value, '') is not null and p_value not in ('good_evidence','needs_check','incomplete','no_evidence','distinguished') then
        perform public.mh_err('MH_INVALID_INPUT', 'tag');
      end if;
      update public.mh_posts set teacher_tag = nullif(p_value, '') where id = p_post;
    when 'note' then update public.mh_posts set teacher_note = btrim(coalesce(p_value, '')) where id = p_post;
    else perform public.mh_err('MH_INVALID_INPUT', 'action');
  end case;
  if p_action in ('reject','delete','approve') then
    perform public.mh_log(s.teacher_id, p.session_id, 'post_' || p_action,
      jsonb_build_object('author', p.author_name, 'excerpt', left(p.body, 120)));
  end if;
end $$;

create or replace function public.mh_teacher_post(p_session uuid, p_kind text, p_body text, p_parent uuid default null,
                                                  p_topic uuid default null, p_client_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_session); pid uuid;
begin
  if p_parent is not null and not exists (select 1 from public.mh_posts where id = p_parent and session_id = p_session) then
    perform public.mh_err('MH_NOT_FOUND');
  end if;
  insert into public.mh_posts(session_id, topic_id, parent_id, author_is_teacher, author_name, kind, body, status, client_id, stage_id)
  values (p_session, p_topic, p_parent, true, (select display_name from public.mh_profiles where id = s.teacher_id),
          coalesce(p_kind, 'summary'), btrim(p_body), 'approved', coalesce(p_client_id, gen_random_uuid()), s.current_stage_id)
  on conflict (session_id, client_id) do nothing
  returning id into pid;
  if pid is null then select id into pid from public.mh_posts where session_id = p_session and client_id = p_client_id; end if;
  return pid;
end $$;

-- ---------------------------- المشاركون ----------------------------
create or replace function public.mh_member_action(p_member uuid, p_action text, p_value text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.mh_members; s public.mh_sessions;
begin
  select * into m from public.mh_members where id = p_member;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  s := public.mh_own_session(m.session_id);
  case p_action
    when 'approve' then update public.mh_members set status = 'active' where id = p_member and status = 'pending';
    when 'revoke' then
      update public.mh_members set status = 'revoked', token_hash = null, token_expires_at = null where id = p_member;
      update public.mh_queue set status = 'withdrawn', ended_at = now() where member_id = p_member and status in ('waiting','speaking');
    when 'restore' then update public.mh_members set status = 'active' where id = p_member and status = 'revoked';
    when 'role' then update public.mh_members set role_label = nullif(btrim(coalesce(p_value, '')), '') where id = p_member;
    when 'note' then update public.mh_members set teacher_note = btrim(coalesce(p_value, '')) where id = p_member;
    when 'grade' then update public.mh_members set overall_grade = btrim(coalesce(p_value, '')) where id = p_member;
    else perform public.mh_err('MH_INVALID_INPUT', 'action');
  end case;
  if p_action in ('approve','revoke','restore','role') then
    perform public.mh_log(s.teacher_id, m.session_id, 'member_' || p_action,
      jsonb_build_object('member', m.display_name, 'value', p_value));
  end if;
end $$;

create or replace function public.mh_points_add(p_member uuid, p_delta int, p_reason text default '', p_post uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.mh_members; s public.mh_sessions;
begin
  select * into m from public.mh_members where id = p_member;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  s := public.mh_own_session(m.session_id);
  if not (public.mh_settings(s.settings) ->> 'points_enabled')::boolean then perform public.mh_err('MH_POINTS_DISABLED'); end if;
  insert into public.mh_points(session_id, member_id, delta, reason, post_id)
  values (m.session_id, p_member, p_delta, btrim(coalesce(p_reason, '')), p_post);
  perform public.mh_log(s.teacher_id, m.session_id, 'points', jsonb_build_object('member', m.display_name, 'delta', p_delta));
end $$;

create or replace function public.mh_evaluate(p_member uuid, p_criterion text, p_score int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.mh_members; s public.mh_sessions;
begin
  select * into m from public.mh_members where id = p_member;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  s := public.mh_own_session(m.session_id);
  if not exists (select 1 from jsonb_array_elements(public.mh_settings(s.settings) -> 'rubric') r where r ->> 'key' = p_criterion) then
    perform public.mh_err('MH_INVALID_INPUT', 'criterion');
  end if;
  insert into public.mh_evaluations(session_id, member_id, criterion, score)
  values (m.session_id, p_member, p_criterion, p_score)
  on conflict (session_id, member_id, criterion) do update set score = excluded.score;
end $$;

-- ------------------------------ الفرق ------------------------------
create or replace function public.mh_team_save(p_session uuid, p_id uuid, p_name text, p_color text default 'olive')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid;
begin
  perform public.mh_own_session(p_session);
  if p_id is null then
    insert into public.mh_teams(session_id, name, color, position)
    values (p_session, btrim(p_name), coalesce(p_color, 'olive'),
            coalesce((select max(position) + 1 from public.mh_teams where session_id = p_session), 0))
    returning id into tid;
  else
    update public.mh_teams set name = btrim(p_name), color = coalesce(p_color, color)
     where id = p_id and session_id = p_session returning id into tid;
    if tid is null then perform public.mh_err('MH_NOT_FOUND'); end if;
  end if;
  return tid;
end $$;

create or replace function public.mh_team_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.mh_teams;
begin
  select * into t from public.mh_teams where id = p_id;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  perform public.mh_own_session(t.session_id);
  delete from public.mh_teams where id = p_id;
end $$;

create or replace function public.mh_team_assign(p_member uuid, p_team uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.mh_members;
begin
  select * into m from public.mh_members where id = p_member;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  perform public.mh_own_session(m.session_id);
  if p_team is null then
    delete from public.mh_team_members where session_id = m.session_id and member_id = p_member;
  else
    if not exists (select 1 from public.mh_teams where id = p_team and session_id = m.session_id) then
      perform public.mh_err('MH_NOT_FOUND');
    end if;
    insert into public.mh_team_members(session_id, member_id, team_id) values (m.session_id, p_member, p_team)
    on conflict (session_id, member_id) do update set team_id = excluded.team_id;
  end if;
end $$;

-- توزيع عشوائي متوازن للطلاب النشطين على الفرق
create or replace function public.mh_team_auto(p_session uuid, p_count int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing int; teams uuid[]; i int := 0; r record;
  names text[] := array['الفريق الأول','الفريق الثاني','الفريق الثالث','الفريق الرابع','الفريق الخامس','الفريق السادس'];
begin
  perform public.mh_own_session(p_session);
  if p_count not between 2 and 6 then perform public.mh_err('MH_INVALID_INPUT', 'count'); end if;
  select count(*) into existing from public.mh_teams where session_id = p_session;
  while existing < p_count loop
    insert into public.mh_teams(session_id, name, color, position)
    values (p_session, names[existing + 1] || case when exists (select 1 from public.mh_teams where session_id = p_session and name = names[existing + 1]) then ' (' || (existing + 1) || ')' else '' end,
            (array['olive','gold','teal','rose','slate','sky'])[existing + 1], existing);
    existing := existing + 1;
  end loop;
  select array_agg(id order by position, created_at) into teams
    from (select id, position, created_at from public.mh_teams where session_id = p_session order by position, created_at limit p_count) x;
  delete from public.mh_team_members where session_id = p_session;
  for r in select id from public.mh_members where session_id = p_session and status = 'active' order by random() loop
    insert into public.mh_team_members(session_id, member_id, team_id) values (p_session, r.id, teams[(i % p_count) + 1]);
    i := i + 1;
  end loop;
end $$;

-- ------------------------ مراحل المناظرة ------------------------
create or replace function public.mh_stage_save(p_session uuid, p_id uuid, p_label text, p_team uuid,
                                                p_duration int, p_max int, p_position int default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid;
begin
  perform public.mh_own_session(p_session);
  if p_team is not null and not exists (select 1 from public.mh_teams where id = p_team and session_id = p_session) then
    perform public.mh_err('MH_NOT_FOUND');
  end if;
  if p_id is null then
    insert into public.mh_debate_stages(session_id, position, team_id, label, duration_sec, max_posts_per_team)
    values (p_session, coalesce(p_position, (select coalesce(max(position) + 1, 0) from public.mh_debate_stages where session_id = p_session)),
            p_team, btrim(p_label), p_duration, coalesce(p_max, 0))
    returning id into sid;
  else
    update public.mh_debate_stages set label = btrim(p_label), team_id = p_team, duration_sec = p_duration,
           max_posts_per_team = coalesce(p_max, 0), position = coalesce(p_position, position)
     where id = p_id and session_id = p_session returning id into sid;
    if sid is null then perform public.mh_err('MH_NOT_FOUND'); end if;
  end if;
  return sid;
end $$;

create or replace function public.mh_stage_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare st public.mh_debate_stages;
begin
  select * into st from public.mh_debate_stages where id = p_id;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  perform public.mh_own_session(st.session_id);
  delete from public.mh_debate_stages where id = p_id;
end $$;

create or replace function public.mh_stage_defaults(p_session uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_session);
begin
  update public.mh_sessions set current_stage_id = null where id = p_session;
  perform public.mh_debate_default_stages_internal(p_session);
end $$;

-- فتح مرحلة (أو التالية إذا كان p_stage فارغًا مع p_next = true)
create or replace function public.mh_stage_activate(p_session uuid, p_stage uuid, p_next boolean default false)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_session); st public.mh_debate_stages; cur_pos int;
begin
  if p_next then
    select position into cur_pos from public.mh_debate_stages where id = s.current_stage_id;
    select * into st from public.mh_debate_stages
     where session_id = p_session and (cur_pos is null or (position, created_at) > (cur_pos, (select created_at from public.mh_debate_stages where id = s.current_stage_id)))
     order by position, created_at limit 1;
    if not found then perform public.mh_err('MH_NO_NEXT_STAGE'); end if;
  elsif p_stage is null then
    update public.mh_sessions set current_stage_id = null where id = p_session;
    perform public.mh_timer_end(p_session, 'stage');
    return null;
  else
    select * into st from public.mh_debate_stages where id = p_stage and session_id = p_session;
    if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  end if;
  update public.mh_sessions set current_stage_id = st.id where id = p_session;
  perform public.mh_timer_start(p_session, 'stage', st.duration_sec * 1000::bigint);
  perform public.mh_log(s.teacher_id, p_session, 'stage_open', jsonb_build_object('stage', st.label));
  return st.id;
end $$;

-- ------------------------ قائمة طلب الحديث ------------------------
create or replace function public.mh_queue_grant_internal(p_session uuid, p_entry uuid, p_seconds int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.mh_queue; other uuid;
begin
  select * into e from public.mh_queue where id = p_entry and session_id = p_session for update;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  update public.mh_queue set status = 'done', ended_at = now() where session_id = p_session and status = 'speaking';
  if e.status in ('done','skipped','withdrawn') then
    -- «إعادة الدور»: إن كان للطالب طلب انتظار آخر نستخدمه، وإلا نعيد تفعيل هذا الطلب
    select id into other from public.mh_queue where session_id = p_session and member_id = e.member_id and status = 'waiting';
    if other is not null then e.id := other; end if;
  end if;
  update public.mh_queue set status = 'speaking', granted_at = now(), ended_at = null,
         ends_at = now() + make_interval(secs => p_seconds)
   where id = e.id;
  perform public.mh_timer_start(p_session, 'turn', p_seconds * 1000::bigint);
end $$;

create or replace function public.mh_queue_action(p_session uuid, p_action text, p_entry uuid default null, p_seconds int default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_session); secs int; nxt uuid; e public.mh_queue;
begin
  secs := coalesce(p_seconds, (public.mh_settings(s.settings) ->> 'turn_seconds')::int);
  if secs not between 5 and 600 then perform public.mh_err('MH_INVALID_INPUT', 'seconds'); end if;
  if p_action = 'grant' then
    perform public.mh_queue_grant_internal(p_session, p_entry, secs);
    select * into e from public.mh_queue where id = p_entry;
    perform public.mh_log(s.teacher_id, p_session, 'turn_grant',
      jsonb_build_object('member', (select display_name from public.mh_members where id = e.member_id), 'seconds', secs));
  elsif p_action = 'next' then
    select id into nxt from public.mh_queue where session_id = p_session and status = 'waiting' order by seq limit 1;
    if nxt is null then
      update public.mh_queue set status = 'done', ended_at = now() where session_id = p_session and status = 'speaking';
      perform public.mh_timer_end(p_session, 'turn');
    else
      perform public.mh_queue_grant_internal(p_session, nxt, secs);
    end if;
  elsif p_action = 'skip' then
    update public.mh_queue set status = case when status = 'speaking' then 'done' else 'skipped' end, ended_at = now()
     where id = p_entry and session_id = p_session and status in ('waiting','speaking')
     returning * into e;
    if e.status = 'done' then perform public.mh_timer_end(p_session, 'turn'); end if;
  elsif p_action = 'end' then
    update public.mh_queue set status = 'done', ended_at = now() where session_id = p_session and status = 'speaking';
    perform public.mh_timer_end(p_session, 'turn');
  elsif p_action = 'extend' then
    update public.mh_queue set ends_at = greatest(ends_at, now()) + make_interval(secs => secs)
     where session_id = p_session and status = 'speaking';
    perform public.mh_timer_add(p_session, 'turn', secs * 1000::bigint);
  elsif p_action = 'clear' then
    update public.mh_queue set status = 'skipped', ended_at = now() where session_id = p_session and status = 'waiting';
  else
    perform public.mh_err('MH_INVALID_INPUT', 'action');
  end if;
end $$;

-- يُستدعى من جهاز المعلم عند انتهاء وقت المداخلة: ينقل الدور تلقائيًا إن كان الإعداد «next»
create or replace function public.mh_queue_tick(p_session uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_session); e public.mh_queue;
begin
  select * into e from public.mh_queue where session_id = p_session and status = 'speaking';
  if not found or e.ends_at > now() then return; end if;
  if public.mh_settings(s.settings) ->> 'turn_end_action' = 'next' then
    perform public.mh_queue_action(p_session, 'next', null, null);
  else
    perform public.mh_timer_end(p_session, 'turn');
  end if;
end $$;

-- ------------------------------ التصويت ------------------------------
create or replace function public.mh_poll_create(p_session uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.mh_sessions := public.mh_own_session(p_session);
  pid uuid; k text := coalesce(p ->> 'kind', 'single'); opts text[]; i int := 0; o text; mc int;
begin
  if k not in ('single','multi','yesno','scale') then perform public.mh_err('MH_INVALID_INPUT', 'kind'); end if;
  select array_agg(btrim(x)) into opts from jsonb_array_elements_text(coalesce(p -> 'options', '[]'::jsonb)) x where btrim(x) <> '';
  if k = 'yesno' then opts := array['نعم','لا'];
  elsif k = 'scale' and coalesce(array_length(opts, 1), 0) < 2 then
    opts := array['لا أوافق بشدة','لا أوافق','محايد','أوافق','أوافق بشدة'];
  end if;
  if coalesce(array_length(opts, 1), 0) not between 2 and 10 then perform public.mh_err('MH_INVALID_INPUT', 'options'); end if;
  mc := case when k = 'multi' then least(greatest(coalesce((p ->> 'max_choices')::int, array_length(opts, 1)), 1), array_length(opts, 1)) else 1 end;
  insert into public.mh_polls(session_id, question, kind, phase, show_voters, hide_results, max_choices)
  values (p_session, btrim(p ->> 'question'), k, coalesce(p ->> 'phase', 'general'),
          coalesce((p ->> 'show_voters')::boolean, false), coalesce((p ->> 'hide_results')::boolean, true), mc)
  returning id into pid;
  foreach o in array opts loop
    insert into public.mh_poll_options(poll_id, label, position) values (pid, o, i);
    i := i + 1;
  end loop;
  return pid;
end $$;

create or replace function public.mh_poll_set_status(p_poll uuid, p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare pl public.mh_polls; s public.mh_sessions;
begin
  select * into pl from public.mh_polls where id = p_poll;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  s := public.mh_own_session(pl.session_id);
  if p_status = 'open' and pl.status = 'draft' then
    update public.mh_polls set status = 'open', opened_at = now() where id = p_poll;
  elsif p_status = 'closed' and pl.status = 'open' then
    update public.mh_polls set status = 'closed', closed_at = now() where id = p_poll;
  elsif p_status = pl.status then
    return;
  else
    perform public.mh_err('MH_BAD_TRANSITION', pl.status || '->' || p_status);
  end if;
  perform public.mh_log(s.teacher_id, pl.session_id, 'poll_' || p_status, jsonb_build_object('question', pl.question));
end $$;

create or replace function public.mh_poll_delete(p_poll uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare pl public.mh_polls; s public.mh_sessions;
begin
  select * into pl from public.mh_polls where id = p_poll;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  s := public.mh_own_session(pl.session_id);
  delete from public.mh_polls where id = p_poll;
  perform public.mh_log(s.teacher_id, pl.session_id, 'poll_delete', jsonb_build_object('question', pl.question));
end $$;

-- عرض التصويت: النتائج تظهر للطالب فقط إذا سمح المعلم أو بعد الإغلاق، والأسماء للمعلم فقط عند تفعيلها
create or replace function public.mh_poll_json(pl public.mh_polls, p_teacher boolean, p_member uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', pl.id, 'question', pl.question, 'kind', pl.kind, 'phase', pl.phase, 'status', pl.status,
    'show_voters', pl.show_voters, 'hide_results', pl.hide_results, 'max_choices', pl.max_choices,
    'opened_at', pl.opened_at, 'closed_at', pl.closed_at,
    'results_visible', (p_teacher or not pl.hide_results or pl.status = 'closed'),
    'ballots', case when (p_teacher or not pl.hide_results or pl.status = 'closed')
                    then (select count(*) from public.mh_poll_ballots b where b.poll_id = pl.id) end,
    'my_choice', case when p_member is not null then
                   (select coalesce(jsonb_agg(v.option_id), '[]'::jsonb) from public.mh_poll_votes v where v.poll_id = pl.id and v.member_id = p_member) end,
    'options', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', o.id, 'label', o.label,
                  'count', case when (p_teacher or not pl.hide_results or pl.status = 'closed')
                                then (select count(*) from public.mh_poll_votes v where v.option_id = o.id) end,
                  'voters', case when p_teacher and pl.show_voters
                                 then (select coalesce(jsonb_agg(m.display_name order by m.display_name), '[]'::jsonb)
                                         from public.mh_poll_votes v join public.mh_members m on m.id = v.member_id
                                        where v.option_id = o.id) end
                ) order by o.position), '[]'::jsonb)
                from public.mh_poll_options o where o.poll_id = pl.id)
  )
$$;

-- ---------------------- حالة الجلسة الكاملة للمعلم ----------------------
create or replace function public.mh_teacher_state(p_session uuid, p_post_limit int default 300)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions; uid uuid := public.mh_require_teacher();
begin
  select * into s from public.mh_sessions where id = p_session;
  if not found or s.teacher_id <> uid then perform public.mh_err('MH_FORBIDDEN'); end if;
  return jsonb_build_object(
    'server_now', now(),
    'session', to_jsonb(s) - 'settings' || jsonb_build_object(
        'settings', public.mh_settings(s.settings),
        'teacher_name', (select display_name from public.mh_profiles where id = s.teacher_id),
        'class_name', (select name from public.mh_classes where id = s.class_id),
        'invited_count', (select count(*) from public.mh_students st where st.class_id = s.class_id)),
    'topics', coalesce((select jsonb_agg(to_jsonb(t) order by t.position, t.created_at) from public.mh_topics t where t.session_id = p_session), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(to_jsonb(t) order by t.position, t.created_at) from public.mh_teams t where t.session_id = p_session), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(to_jsonb(d) order by d.position, d.created_at) from public.mh_debate_stages d where d.session_id = p_session), '[]'::jsonb),
    'timers', public.mh_timers_json(p_session),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'display_name', m.display_name, 'status', m.status, 'role_label', m.role_label,
        'student_id', m.student_id, 'joined_at', m.joined_at, 'last_seen_at', m.last_seen_at,
        'online', (m.token_hash is not null and m.last_seen_at > now() - interval '45 seconds'),
        'team_id', (select tm.team_id from public.mh_team_members tm where tm.session_id = p_session and tm.member_id = m.id),
        'teacher_note', m.teacher_note, 'overall_grade', m.overall_grade,
        'points', (select coalesce(sum(delta), 0) from public.mh_points pt where pt.member_id = m.id),
        'post_count', (select count(*) from public.mh_posts p where p.member_id = m.id and p.parent_id is null and p.status <> 'rejected'),
        'reply_count', (select count(*) from public.mh_posts p where p.member_id = m.id and p.parent_id is not null and p.status <> 'rejected'),
        'evaluations', (select coalesce(jsonb_object_agg(e.criterion, e.score), '{}'::jsonb) from public.mh_evaluations e where e.member_id = m.id)
      ) order by m.display_name) from public.mh_members m where m.session_id = p_session), '[]'::jsonb),
    'not_joined', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'full_name', st.full_name) order by st.full_name)
        from public.mh_students st where st.class_id = s.class_id
         and not exists (select 1 from public.mh_members m where m.session_id = p_session and m.student_id = st.id)), '[]'::jsonb),
    'queue', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'member_id', q.member_id, 'name', m.display_name,
        'seq', q.seq, 'status', q.status, 'requested_at', q.requested_at, 'granted_at', q.granted_at, 'ends_at', q.ends_at) order by q.seq)
        from public.mh_queue q join public.mh_members m on m.id = q.member_id
        where q.session_id = p_session and (q.status in ('waiting','speaking') or q.updated_at > now() - interval '30 minutes')), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(public.mh_post_json(p, true) order by p.created_at desc)
        from (select * from public.mh_posts where session_id = p_session order by created_at desc limit p_post_limit) p), '[]'::jsonb),
    'post_total', (select count(*) from public.mh_posts where session_id = p_session),
    'polls', coalesce((select jsonb_agg(public.mh_poll_json(pl, true, null) order by pl.created_at) from public.mh_polls pl where pl.session_id = p_session), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'actor_name', a.actor_name, 'details', a.details, 'created_at', a.created_at) order by a.created_at desc)
        from (select * from public.mh_audit where session_id = p_session order by created_at desc limit 50) a), '[]'::jsonb)
  );
end $$;

-- تحميل تدريجي للمشاركات الأقدم (للمعلم)
create or replace function public.mh_teacher_posts_before(p_session uuid, p_before timestamptz, p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.mh_own_session(p_session);
  return coalesce((select jsonb_agg(public.mh_post_json(p, true) order by p.created_at desc)
    from (select * from public.mh_posts where session_id = p_session and created_at < p_before
          order by created_at desc limit least(p_limit, 200)) p), '[]'::jsonb);
end $$;

-- سياسة الاحتفاظ: حذف جلسات المعلم المغلقة الأقدم من عدد أيام محدد
create or replace function public.mh_purge_closed_sessions(p_days int)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.mh_require_teacher(); n int;
begin
  if p_days < 1 then perform public.mh_err('MH_INVALID_INPUT', 'days'); end if;
  delete from public.mh_sessions where teacher_id = uid and status = 'closed' and closed_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  perform public.mh_log(uid, null, 'purge_sessions', jsonb_build_object('days', p_days, 'count', n));
  return n;
end $$;
