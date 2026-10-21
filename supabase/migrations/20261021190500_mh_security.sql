-- =====================================================================
-- «مِحْوَر» — الملف 6: Row Level Security والصلاحيات
--
-- المبدأ:
--  • RLS مفعّل على كل جداول mh_.
--  • المعلم (authenticated) يقرأ بياناته فقط عبر سياسات SELECT مبنية على الملكية.
--  • لا توجد سياسات INSERT/UPDATE/DELETE لأي دور: كل الكتابة تمر عبر دوال RPC
--    محمية (security definer) تتحقق من الهوية والملكية وإعدادات الجلسة.
--  • الطلاب (anon) لا يملكون أي صلاحية على الجداول إطلاقًا؛ يتعاملون عبر دوال الطالب فقط.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['mh_profiles','mh_classes','mh_students','mh_sessions','mh_topics','mh_members','mh_teams',
                           'mh_team_members','mh_debate_stages','mh_posts','mh_evidence','mh_polls','mh_poll_options',
                           'mh_poll_ballots','mh_poll_votes','mh_queue','mh_timers','mh_evaluations','mh_points',
                           'mh_reports','mh_audit','mh_join_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- دالة مساعدة: هل الجلسة ملك المستخدم الحالي؟
create or replace function public.mh_is_owner(p_session uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.mh_sessions s where s.id = p_session and s.teacher_id = auth.uid())
$$;

-- صلاحية القراءة للمعلم على بياناته فقط (عدا رموز الطلاب المجزأة ومحاولات الدخول)
grant select on public.mh_profiles, public.mh_classes, public.mh_students, public.mh_sessions, public.mh_topics,
                public.mh_teams, public.mh_team_members, public.mh_debate_stages, public.mh_posts, public.mh_evidence,
                public.mh_polls, public.mh_poll_options, public.mh_poll_ballots, public.mh_poll_votes, public.mh_queue,
                public.mh_timers, public.mh_evaluations, public.mh_points, public.mh_reports, public.mh_audit
  to authenticated;
grant select (id, session_id, student_id, display_name, status, role_label, teacher_note, overall_grade,
              joined_at, last_seen_at, created_at, updated_at) on public.mh_members to authenticated;

drop policy if exists mh_profiles_select on public.mh_profiles;
create policy mh_profiles_select on public.mh_profiles for select to authenticated using (id = auth.uid());

drop policy if exists mh_classes_select on public.mh_classes;
create policy mh_classes_select on public.mh_classes for select to authenticated using (teacher_id = auth.uid());

drop policy if exists mh_students_select on public.mh_students;
create policy mh_students_select on public.mh_students for select to authenticated
  using (exists (select 1 from public.mh_classes c where c.id = class_id and c.teacher_id = auth.uid()));

drop policy if exists mh_sessions_select on public.mh_sessions;
create policy mh_sessions_select on public.mh_sessions for select to authenticated using (teacher_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['mh_topics','mh_members','mh_teams','mh_team_members','mh_debate_stages','mh_posts',
                           'mh_polls','mh_queue','mh_timers','mh_evaluations','mh_points','mh_reports'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.mh_is_owner(session_id))', t || '_select', t);
  end loop;
end $$;

drop policy if exists mh_evidence_select on public.mh_evidence;
create policy mh_evidence_select on public.mh_evidence for select to authenticated
  using (exists (select 1 from public.mh_posts p where p.id = post_id and public.mh_is_owner(p.session_id)));

drop policy if exists mh_poll_options_select on public.mh_poll_options;
create policy mh_poll_options_select on public.mh_poll_options for select to authenticated
  using (exists (select 1 from public.mh_polls p where p.id = poll_id and public.mh_is_owner(p.session_id)));

drop policy if exists mh_poll_ballots_select on public.mh_poll_ballots;
create policy mh_poll_ballots_select on public.mh_poll_ballots for select to authenticated
  using (exists (select 1 from public.mh_polls p where p.id = poll_id and public.mh_is_owner(p.session_id)));

drop policy if exists mh_poll_votes_select on public.mh_poll_votes;
create policy mh_poll_votes_select on public.mh_poll_votes for select to authenticated
  using (exists (select 1 from public.mh_polls p where p.id = poll_id and public.mh_is_owner(p.session_id)));

drop policy if exists mh_audit_select on public.mh_audit;
create policy mh_audit_select on public.mh_audit for select to authenticated using (teacher_id = auth.uid());
-- mh_join_attempts: بلا سياسات = لا وصول لأي دور عبر واجهة البيانات.

-- تثبيت search_path لكل دوال mh_ التي لم تحدده (توصية مدقق Supabase الأمني)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'mh\_%'
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
  end loop;
end $$;

-- ------------------------- صلاحيات تنفيذ الدوال -------------------------
-- نسحب التنفيذ من الجميع لكل دوال mh_ ثم نمنحه للدوال العامة فقط.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'mh\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- دوال الطالب والدخول (متاحة للزائر غير المسجل؛ كل منها يتحقق من رمز الوصول)
grant execute on function
  public.mh_server_now(),
  public.mh_lookup_session(text),
  public.mh_join(text, uuid, text, text),
  public.mh_heartbeat(text),
  public.mh_student_state(text, int),
  public.mh_student_posts_before(text, timestamptz, int),
  public.mh_submit_post(text, uuid, text, text, uuid, uuid, jsonb),
  public.mh_edit_post(text, uuid, text, jsonb),
  public.mh_request_speak(text),
  public.mh_cancel_speak(text),
  public.mh_vote(text, uuid, uuid[])
to anon, authenticated;

-- دوال المعلم (تتطلب تسجيل الدخول، وكل دالة تتحقق من ملكية الصف/الجلسة)
grant execute on function
  public.mh_teacher_bootstrap(text),
  public.mh_teacher_home(),
  public.mh_class_save(uuid, text),
  public.mh_class_delete(uuid),
  public.mh_class_detail(uuid),
  public.mh_students_add(uuid, text[]),
  public.mh_student_update(uuid, text),
  public.mh_student_code(uuid, text),
  public.mh_student_delete(uuid),
  public.mh_session_create(jsonb),
  public.mh_session_update(uuid, jsonb),
  public.mh_session_delete(uuid),
  public.mh_session_set_status(uuid, text),
  public.mh_session_set_mode(uuid, text),
  public.mh_timer_control(uuid, text, text, int),
  public.mh_topic_save(uuid, uuid, text, text),
  public.mh_topic_set(uuid, text),
  public.mh_post_moderate(uuid, text, text),
  public.mh_teacher_post(uuid, text, text, uuid, uuid, uuid),
  public.mh_member_action(uuid, text, text),
  public.mh_points_add(uuid, int, text, uuid),
  public.mh_evaluate(uuid, text, int),
  public.mh_team_save(uuid, uuid, text, text),
  public.mh_team_delete(uuid),
  public.mh_team_assign(uuid, uuid),
  public.mh_team_auto(uuid, int),
  public.mh_stage_save(uuid, uuid, text, uuid, int, int, int),
  public.mh_stage_delete(uuid),
  public.mh_stage_defaults(uuid),
  public.mh_stage_activate(uuid, uuid, boolean),
  public.mh_queue_action(uuid, text, uuid, int),
  public.mh_queue_tick(uuid),
  public.mh_poll_create(uuid, jsonb),
  public.mh_poll_set_status(uuid, text),
  public.mh_poll_delete(uuid),
  public.mh_teacher_state(uuid, int),
  public.mh_teacher_posts_before(uuid, timestamptz, int),
  public.mh_purge_closed_sessions(int),
  public.mh_report_build(uuid),
  public.mh_report_save_summary(uuid, text),
  public.mh_seed_demo()
to authenticated;

-- الدوال المستخدمة داخل سياسات RLS يجب أن تكون قابلة للتنفيذ لدور المعلم
grant execute on function public.mh_is_owner(uuid) to authenticated;
