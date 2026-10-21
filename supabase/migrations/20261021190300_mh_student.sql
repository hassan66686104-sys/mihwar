-- =====================================================================
-- «مِحْوَر» — الملف 4: دوال الطالب
-- الطالب لا يملك حسابًا؛ يدخل برمز الجلسة + رمزه الشخصي، فيحصل على رمز وصول (token)
-- عشوائي يُخزَّن مُجزّأً فقط. كل إجراء يتحقق من الرمز ومن إعدادات المعلم على الخادم.
-- =====================================================================

create or replace function public.mh_lookup_session(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions; st jsonb; joinable boolean;
begin
  select * into s from public.mh_sessions where join_code = upper(btrim(coalesce(p_code, '')));
  if not found then perform public.mh_err('MH_BAD_CODE'); end if;
  st := public.mh_settings(s.settings);
  joinable := s.status in ('open','paused') or (s.status = 'closed' and (st ->> 'allow_join_closed')::boolean);
  return jsonb_build_object(
    'session_id', s.id, 'title', s.title, 'lesson', s.lesson, 'status', s.status, 'is_demo', s.is_demo,
    'teacher_name', (select display_name from public.mh_profiles where id = s.teacher_id),
    'join_mode', st ->> 'join_mode', 'joinable', joinable,
    -- أسماء الصف فقط (بلا رموز) لتسهيل اختيار الاسم؛ الرمز الشخصي هو ما يثبت الهوية
    'roster', case when joinable and st ->> 'join_mode' = 'roster' then
                coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'full_name', x.full_name) order by x.full_name)
                          from public.mh_students x where x.class_id = s.class_id), '[]'::jsonb)
              else '[]'::jsonb end
  );
end $$;

-- يعيد {ok:false, error} بدل رفع استثناء عند خطأ بيانات الدخول، حتى تُحفظ المحاولة الفاشلة لتحديد المعدل
create or replace function public.mh_join(p_code text, p_student uuid, p_access_code text, p_name text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.mh_sessions; st jsonb; stu public.mh_students; m public.mh_members; tok text; nm text;
begin
  select * into s from public.mh_sessions where join_code = upper(btrim(coalesce(p_code, '')));
  if not found then perform public.mh_err('MH_BAD_CODE'); end if;
  st := public.mh_settings(s.settings);
  if s.status = 'draft' then perform public.mh_err('MH_SESSION_NOT_STARTED'); end if;
  if s.status = 'closed' and not (st ->> 'allow_join_closed')::boolean then perform public.mh_err('MH_SESSION_CLOSED'); end if;
  if (select count(*) from public.mh_join_attempts a
       where a.session_id = s.id and not a.ok and a.created_at > now() - interval '10 minutes') >= 60 then
    perform public.mh_err('MH_RATE_LIMIT');
  end if;

  if st ->> 'join_mode' = 'roster' then
    if p_student is null then perform public.mh_err('MH_INVALID_INPUT', 'student'); end if;
    if (select count(*) from public.mh_join_attempts a
         where a.session_id = s.id and a.student_id = p_student and not a.ok and a.created_at > now() - interval '10 minutes') >= 5 then
      perform public.mh_err('MH_RATE_LIMIT');
    end if;
    select * into stu from public.mh_students where id = p_student and class_id = s.class_id;
    if not found or stu.code_revoked or stu.access_code <> upper(btrim(coalesce(p_access_code, ''))) then
      insert into public.mh_join_attempts(session_id, student_id, ok) values (s.id, p_student, false);
      return jsonb_build_object('ok', false, 'error', 'MH_BAD_CREDENTIALS');
    end if;
    select * into m from public.mh_members where session_id = s.id and student_id = stu.id;
    if found and m.status = 'revoked' then perform public.mh_err('MH_REVOKED'); end if;
    if not found then
      insert into public.mh_members(session_id, student_id, display_name, status)
      values (s.id, stu.id, stu.full_name, 'active') returning * into m;
    end if;
  else
    nm := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
    if char_length(nm) not between 2 and 80 then perform public.mh_err('MH_INVALID_INPUT', 'name'); end if;
    -- لا يُسمح بالدخول باسم مستخدم مسبقًا: هذا يمنع انتحال اسم طالب دخل قبلك
    if exists (select 1 from public.mh_members where session_id = s.id and display_name = nm) then
      insert into public.mh_join_attempts(session_id, ok) values (s.id, false);
      return jsonb_build_object('ok', false, 'error', 'MH_NAME_TAKEN');
    end if;
    insert into public.mh_members(session_id, display_name, status) values (s.id, nm, 'pending') returning * into m;
  end if;

  tok := public.mh_new_token();
  update public.mh_members set token_hash = public.mh_hash(tok), token_expires_at = now() + interval '12 hours',
         last_seen_at = now()
   where id = m.id returning * into m;
  insert into public.mh_join_attempts(session_id, student_id, ok) values (s.id, m.student_id, true);
  return jsonb_build_object('ok', true, 'token', tok, 'member_id', m.id, 'session_id', s.id, 'status', m.status,
                            'display_name', m.display_name);
end $$;

create or replace function public.mh_heartbeat(p_token text)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.mh_members := public.mh_member_by_token(p_token, true);
begin
  update public.mh_members set last_seen_at = now() where id = m.id;
  return now();
end $$;

create or replace function public.mh_student_post_json(p public.mh_posts, p_member uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select public.mh_post_json(p, false)
         || case when p.member_id = p_member then jsonb_build_object('teacher_tag', p.teacher_tag, 'mine', true)
                 else jsonb_build_object('mine', false) end
$$;

-- حالة الجلسة كما يراها الطالب: لا تتضمن المشاركات المرفوضة أو قيد المراجعة لغيره، ولا ملاحظات المعلم
create or replace function public.mh_student_state(p_token text, p_post_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.mh_members := public.mh_member_by_token(p_token, true);
  s public.mh_sessions; st jsonb; my_team uuid; show_points boolean;
begin
  update public.mh_members set last_seen_at = now() where id = m.id;
  select * into s from public.mh_sessions where id = m.session_id;
  st := public.mh_settings(s.settings);
  select team_id into my_team from public.mh_team_members where session_id = s.id and member_id = m.id;
  show_points := (st ->> 'points_enabled')::boolean and (st ->> 'show_points_to_students')::boolean;
  if m.status = 'pending' then
    return jsonb_build_object('server_now', now(),
      'me', jsonb_build_object('id', m.id, 'display_name', m.display_name, 'status', m.status),
      'session', jsonb_build_object('id', s.id, 'title', s.title, 'lesson', s.lesson, 'status', s.status, 'is_demo', s.is_demo,
                 'teacher_name', (select display_name from public.mh_profiles where id = s.teacher_id)));
  end if;
  return jsonb_build_object(
    'server_now', now(),
    'me', jsonb_build_object('id', m.id, 'display_name', m.display_name, 'status', m.status, 'role_label', m.role_label,
            'team_id', my_team,
            'points', case when show_points then (select coalesce(sum(delta), 0) from public.mh_points where member_id = m.id) end,
            'post_count', (select count(*) from public.mh_posts where member_id = m.id and parent_id is null and status <> 'rejected'),
            'reply_count', (select count(*) from public.mh_posts where member_id = m.id and parent_id is not null and status <> 'rejected')),
    'session', jsonb_build_object(
        'id', s.id, 'title', s.title, 'lesson', s.lesson, 'main_question', s.main_question, 'instructions', s.instructions,
        'mode', s.mode, 'status', s.status, 'is_demo', s.is_demo, 'current_stage_id', s.current_stage_id,
        'teacher_name', (select display_name from public.mh_profiles where id = s.teacher_id),
        'settings', jsonb_build_object(
            'moderation', st -> 'moderation', 'posts_open', st -> 'posts_open', 'questions_open', st -> 'questions_open',
            'replies_enabled', st -> 'replies_enabled', 'reply_scope', st -> 'reply_scope',
            'max_posts_per_student', st -> 'max_posts_per_student', 'max_replies_per_student', st -> 'max_replies_per_student',
            'edit_window_sec', st -> 'edit_window_sec', 'show_own_history', st -> 'show_own_history',
            'evidence_enabled', st -> 'evidence_enabled', 'hand_raise_enabled', st -> 'hand_raise_enabled',
            'turn_posting', st -> 'turn_posting', 'points_visible', to_jsonb(show_points))),
    'topics', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'body', t.body) order by t.position, t.created_at)
                        from public.mh_topics t where t.session_id = s.id and t.is_active), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.position, t.created_at)
                       from public.mh_teams t where t.session_id = s.id), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label, 'team_id', d.team_id, 'position', d.position,
                          'duration_sec', d.duration_sec, 'max_posts_per_team', d.max_posts_per_team) order by d.position, d.created_at)
                        from public.mh_debate_stages d where d.session_id = s.id), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'display_name', x.display_name, 'role_label', x.role_label,
                          'team_id', (select tm.team_id from public.mh_team_members tm where tm.session_id = s.id and tm.member_id = x.id),
                          'online', (x.token_hash is not null and x.last_seen_at > now() - interval '45 seconds')) order by x.display_name)
                         from public.mh_members x where x.session_id = s.id and x.status = 'active'), '[]'::jsonb),
    'timers', public.mh_timers_json(s.id),
    'queue', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'member_id', q.member_id, 'name', x.display_name, 'seq', q.seq,
                         'status', q.status, 'granted_at', q.granted_at, 'ends_at', q.ends_at) order by q.seq)
                       from public.mh_queue q join public.mh_members x on x.id = q.member_id
                       where q.session_id = s.id and q.status in ('waiting','speaking')), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(public.mh_student_post_json(p, m.id) order by p.created_at desc)
                       from (select * from public.mh_posts
                             where session_id = s.id and (status = 'approved' or (member_id = m.id and (st ->> 'show_own_history')::boolean))
                             order by created_at desc limit least(coalesce(p_post_limit, 200), 300)) p), '[]'::jsonb),
    'post_total', (select count(*) from public.mh_posts where session_id = s.id and status = 'approved'),
    'polls', coalesce((select jsonb_agg(public.mh_poll_json(pl, false, m.id) order by pl.created_at)
                       from public.mh_polls pl where pl.session_id = s.id and pl.status in ('open','closed')), '[]'::jsonb)
  );
end $$;

create or replace function public.mh_student_posts_before(p_token text, p_before timestamptz, p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.mh_members := public.mh_member_by_token(p_token);
begin
  return coalesce((select jsonb_agg(public.mh_student_post_json(p, m.id) order by p.created_at desc)
    from (select * from public.mh_posts
          where session_id = m.session_id and created_at < p_before and (status = 'approved' or member_id = m.id)
          order by created_at desc limit least(coalesce(p_limit, 100), 200)) p), '[]'::jsonb);
end $$;

-- التحقق من حقول الدليل وبناء صف evidence (أو null إن كانت كلها فارغة)
create or replace function public.mh_evidence_has_content(p jsonb)
returns boolean language sql immutable as $$
  select p is not null and jsonb_typeof(p) = 'object' and exists (
    select 1 from jsonb_each_text(p) e
    where e.key in ('quote','surah','ayah','hadith_source','hadith_grade','book_title','page','reasoning','url')
      and btrim(coalesce(e.value, '')) <> '')
$$;

create or replace function public.mh_save_evidence(p_post uuid, p_kind text, p jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.mh_evidence where post_id = p_post;
  if not public.mh_evidence_has_content(p) then return; end if;
  insert into public.mh_evidence(post_id, source_type, quote, surah, ayah, hadith_source, hadith_grade, book_title, page, reasoning, url)
  values (p_post,
          case when p_kind in ('quran','hadith','fiqh','textbook','example') then p_kind else 'other' end,
          btrim(coalesce(p ->> 'quote', '')), btrim(coalesce(p ->> 'surah', '')), btrim(coalesce(p ->> 'ayah', '')),
          btrim(coalesce(p ->> 'hadith_source', '')), btrim(coalesce(p ->> 'hadith_grade', '')),
          btrim(coalesce(p ->> 'book_title', '')), btrim(coalesce(p ->> 'page', '')),
          btrim(coalesce(p ->> 'reasoning', '')), btrim(coalesce(p ->> 'url', '')));
end $$;

-- إرسال مشاركة أو رد. client_id يمنع التكرار عند النقر المزدوج أو إعادة الإرسال بعد انقطاع الاتصال.
create or replace function public.mh_submit_post(
  p_token text, p_client_id uuid, p_kind text, p_body text,
  p_parent uuid default null, p_topic uuid default null, p_evidence jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.mh_members := public.mh_member_by_token(p_token);
  s public.mh_sessions; st jsonb; existing public.mh_posts; parent public.mh_posts; stage public.mh_debate_stages;
  my_team uuid; parent_team uuid; lim int; cnt int; new_status text; pid uuid; sp public.mh_queue;
begin
  if p_client_id is null then perform public.mh_err('MH_INVALID_INPUT', 'client_id'); end if;
  -- قفل لكل طالب: يمنع تجاوز حدود المشاركة عند وصول طلبين في اللحظة نفسها
  perform pg_advisory_xact_lock(hashtextextended('mh_member:' || m.id::text, 0));

  select * into existing from public.mh_posts where session_id = m.session_id and client_id = p_client_id;
  if found then
    if existing.member_id is distinct from m.id then perform public.mh_err('MH_INVALID_INPUT', 'client_id'); end if;
    return jsonb_build_object('id', existing.id, 'status', existing.status, 'duplicate', true);
  end if;

  select * into s from public.mh_sessions where id = m.session_id;
  st := public.mh_settings(s.settings);
  if s.status = 'paused' then perform public.mh_err('MH_SESSION_PAUSED'); end if;
  if s.status <> 'open' then perform public.mh_err('MH_SESSION_CLOSED'); end if;
  if public.mh_timer_ended(s.id, 'session') then perform public.mh_err('MH_TIME_UP'); end if;

  if p_kind is null or p_kind not in ('opinion','quran','hadith','fiqh','textbook','example','rebuttal','question','summary') then
    perform public.mh_err('MH_INVALID_INPUT', 'kind');
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then perform public.mh_err('MH_INVALID_INPUT', 'body'); end if;

  if p_kind = 'question' then
    if not (st ->> 'questions_open')::boolean then perform public.mh_err('MH_QUESTIONS_CLOSED'); end if;
  elsif not (st ->> 'posts_open')::boolean then
    perform public.mh_err('MH_POSTS_CLOSED');
  end if;

  if (select count(*) from public.mh_posts where member_id = m.id and created_at > now() - interval '20 seconds') >= 5 then
    perform public.mh_err('MH_RATE_LIMIT');
  end if;

  select team_id into my_team from public.mh_team_members where session_id = s.id and member_id = m.id;

  if p_parent is not null then
    select * into parent from public.mh_posts where id = p_parent and session_id = s.id and status = 'approved';
    if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
    if not (st ->> 'replies_enabled')::boolean or parent.replies_locked then perform public.mh_err('MH_REPLIES_CLOSED'); end if;
    if st ->> 'reply_scope' = 'team' and parent.member_id is not null then
      select team_id into parent_team from public.mh_team_members where session_id = s.id and member_id = parent.member_id;
      if my_team is null or parent_team is distinct from my_team then perform public.mh_err('MH_NOT_ALLOWED', 'team'); end if;
    end if;
    lim := (st ->> 'max_replies_per_student')::int;
    if lim > 0 and (select count(*) from public.mh_posts where member_id = m.id and parent_id is not null and status <> 'rejected') >= lim then
      perform public.mh_err('MH_LIMIT_REACHED');
    end if;
  else
    lim := (st ->> 'max_posts_per_student')::int;
    if lim > 0 and (select count(*) from public.mh_posts where member_id = m.id and parent_id is null and status <> 'rejected') >= lim then
      perform public.mh_err('MH_LIMIT_REACHED');
    end if;
  end if;

  -- النقاش بالدور: الإرسال للمتحدث الحالي فقط وضمن وقته (إلا الأسئلة إن كان بابها مفتوحًا)
  if s.mode = 'turns' and st ->> 'turn_posting' = 'speaker_only' and p_kind <> 'question' then
    select * into sp from public.mh_queue where session_id = s.id and status = 'speaking';
    if not found or sp.member_id <> m.id then perform public.mh_err('MH_NOT_YOUR_TURN'); end if;
    if sp.ends_at <= now() or public.mh_timer_ended(s.id, 'turn') then perform public.mh_err('MH_TIME_UP'); end if;
  end if;

  -- المناظرة: المرحلة الحالية تحدد الفريق المسموح له وعدد مشاركاته ووقته
  if s.mode = 'debate' and p_kind <> 'question' then
    if s.current_stage_id is null then perform public.mh_err('MH_STAGE_NOT_OPEN'); end if;
    select * into stage from public.mh_debate_stages where id = s.current_stage_id;
    if stage.team_id is null or my_team is distinct from stage.team_id then perform public.mh_err('MH_NOT_YOUR_STAGE'); end if;
    if public.mh_timer_ended(s.id, 'stage') then perform public.mh_err('MH_TIME_UP'); end if;
    if stage.max_posts_per_team > 0 then
      perform pg_advisory_xact_lock(hashtextextended('mh_stage:' || stage.id::text, 0));
      select count(*) into cnt from public.mh_posts where stage_id = stage.id and team_id = stage.team_id and status <> 'rejected';
      if cnt >= stage.max_posts_per_team then perform public.mh_err('MH_LIMIT_REACHED'); end if;
    end if;
  end if;

  if p_topic is not null and not exists (select 1 from public.mh_topics where id = p_topic and session_id = s.id and is_active) then
    perform public.mh_err('MH_NOT_FOUND', 'topic');
  end if;
  if public.mh_evidence_has_content(p_evidence) and not (st ->> 'evidence_enabled')::boolean then
    perform public.mh_err('MH_EVIDENCE_DISABLED');
  end if;

  new_status := case when (st ->> 'moderation')::boolean then 'pending' else 'approved' end;
  begin
    insert into public.mh_posts(session_id, topic_id, parent_id, member_id, author_name, kind, body, status, team_id, stage_id, client_id)
    values (s.id, coalesce(p_topic, parent.topic_id), p_parent, m.id, m.display_name, p_kind, btrim(p_body), new_status, my_team,
            case when s.mode = 'debate' then s.current_stage_id end, p_client_id)
    returning id into pid;
    perform public.mh_save_evidence(pid, p_kind, p_evidence);
  exception when check_violation or string_data_right_truncation then
    perform public.mh_err('MH_INVALID_INPUT', 'evidence');
  end;
  return jsonb_build_object('id', pid, 'status', new_status, 'duplicate', false);
end $$;

-- تعديل المشاركة خلال المهلة التي حددها المعلم فقط
create or replace function public.mh_edit_post(p_token text, p_post uuid, p_body text, p_evidence jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.mh_members := public.mh_member_by_token(p_token); p public.mh_posts; s public.mh_sessions; st jsonb; win int; ns text;
begin
  select * into p from public.mh_posts where id = p_post and member_id = m.id;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  select * into s from public.mh_sessions where id = p.session_id;
  st := public.mh_settings(s.settings);
  if s.status <> 'open' then perform public.mh_err('MH_SESSION_CLOSED'); end if;
  if p.status = 'rejected' then perform public.mh_err('MH_NOT_ALLOWED'); end if;
  win := (st ->> 'edit_window_sec')::int;
  if win = 0 or now() > p.created_at + make_interval(secs => win) then perform public.mh_err('MH_EDIT_EXPIRED'); end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then perform public.mh_err('MH_INVALID_INPUT', 'body'); end if;
  ns := case when (st ->> 'moderation')::boolean then 'pending' else p.status end;
  begin
    update public.mh_posts set body = btrim(p_body), edited_at = now(), status = ns where id = p_post;
    if p_evidence is not null then perform public.mh_save_evidence(p_post, p.kind, p_evidence); end if;
  exception when check_violation or string_data_right_truncation then
    perform public.mh_err('MH_INVALID_INPUT', 'evidence');
  end;
  return jsonb_build_object('id', p_post, 'status', ns);
end $$;

create or replace function public.mh_request_speak(p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.mh_members := public.mh_member_by_token(p_token); s public.mh_sessions; e public.mh_queue;
begin
  select * into s from public.mh_sessions where id = m.session_id;
  if s.status = 'paused' then perform public.mh_err('MH_SESSION_PAUSED'); end if;
  if s.status <> 'open' then perform public.mh_err('MH_SESSION_CLOSED'); end if;
  if not (public.mh_settings(s.settings) ->> 'hand_raise_enabled')::boolean then perform public.mh_err('MH_NOT_ALLOWED'); end if;
  select * into e from public.mh_queue where session_id = s.id and member_id = m.id and status in ('waiting','speaking');
  if found then return jsonb_build_object('id', e.id, 'seq', e.seq, 'status', e.status, 'duplicate', true); end if;
  begin
    insert into public.mh_queue(session_id, member_id) values (s.id, m.id) returning * into e;
  exception when unique_violation then
    select * into e from public.mh_queue where session_id = s.id and member_id = m.id and status in ('waiting','speaking');
  end;
  return jsonb_build_object('id', e.id, 'seq', e.seq, 'status', e.status, 'duplicate', false);
end $$;

create or replace function public.mh_cancel_speak(p_token text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.mh_members := public.mh_member_by_token(p_token);
begin
  update public.mh_queue set status = 'withdrawn', ended_at = now()
   where session_id = m.session_id and member_id = m.id and status = 'waiting';
end $$;

-- التصويت: بطاقة واحدة لكل طالب (المفتاح الأساسي في mh_poll_ballots يمنع التكرار حتى مع الطلبات المتزامنة)
create or replace function public.mh_vote(p_token text, p_poll uuid, p_options uuid[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.mh_members := public.mh_member_by_token(p_token); pl public.mh_polls; s public.mh_sessions;
  opts uuid[]; n int; o uuid;
begin
  select * into pl from public.mh_polls where id = p_poll and session_id = m.session_id;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  select * into s from public.mh_sessions where id = m.session_id;
  if s.status = 'paused' then perform public.mh_err('MH_SESSION_PAUSED'); end if;
  if s.status <> 'open' then perform public.mh_err('MH_SESSION_CLOSED'); end if;
  if pl.status <> 'open' then perform public.mh_err('MH_POLL_CLOSED'); end if;
  select array_agg(distinct x) into opts from unnest(coalesce(p_options, '{}')) x;
  n := coalesce(array_length(opts, 1), 0);
  if n < 1 or (pl.kind <> 'multi' and n <> 1) or n > pl.max_choices then perform public.mh_err('MH_INVALID_INPUT', 'choices'); end if;
  if (select count(*) from public.mh_poll_options where poll_id = p_poll and id = any(opts)) <> n then
    perform public.mh_err('MH_INVALID_INPUT', 'options');
  end if;
  begin
    insert into public.mh_poll_ballots(poll_id, member_id) values (p_poll, m.id);
  exception when unique_violation then
    perform public.mh_err('MH_ALREADY_VOTED');
  end;
  foreach o in array opts loop
    insert into public.mh_poll_votes(poll_id, member_id, option_id) values (p_poll, m.id, o);
  end loop;
  return jsonb_build_object('ok', true);
end $$;
