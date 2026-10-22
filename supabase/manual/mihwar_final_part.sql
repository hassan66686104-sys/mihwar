-- مِحْوَر: الجزء الأخير (دوال الحذف + الجلسة التجريبية + صلاحيات التنفيذ). الصقه كاملًا في Supabase → SQL Editor ثم Run.
-- آمن لإعادة التشغيل: لا يحذف أي بيانات عند تشغيله، بل يعرّف دوال يستدعيها المعلم لاحقًا.
set check_function_bodies = off;
create or replace function public.mh_class_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.mh_classes := public.mh_own_class(p_id);
begin
  perform public.mh_log(c.teacher_id, null, 'class_delete', jsonb_build_object('name', c.name));
  delete from public.mh_classes where id = p_id;
end $$;

create or replace function public.mh_student_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.mh_own_student(p_id);
  delete from public.mh_students where id = p_id;
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

create or replace function public.mh_session_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_id);
begin
  perform public.mh_log(s.teacher_id, p_id, 'session_delete', jsonb_build_object('title', s.title));
  delete from public.mh_sessions where id = p_id;
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

create or replace function public.mh_stage_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare st public.mh_debate_stages;
begin
  select * into st from public.mh_debate_stages where id = p_id;
  if not found then perform public.mh_err('MH_NOT_FOUND'); end if;
  perform public.mh_own_session(st.session_id);
  delete from public.mh_debate_stages where id = p_id;
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

-- ---------------------------------------------------------------------
-- البيانات التجريبية: صف وجلسة «التوكل على الله والأخذ بالأسباب» بأسماء وهمية.
-- تُعلَّم بـ is_demo وتظهر في الواجهة بشارة «بيانات تجريبية — ليست لطلاب حقيقيين».
-- إعادة التنفيذ تحذف النسخة التجريبية السابقة للمعلم نفسه فقط.
-- ---------------------------------------------------------------------
create or replace function public.mh_seed_demo()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := public.mh_require_teacher();
  cid uuid; sid uuid; code text; t1 uuid; t2 uuid; t3 uuid; tm1 uuid; tm2 uuid;
  names text[] := array['أحمد سالم','يوسف خالد','عمر عبدالله','محمد إبراهيم','عبدالرحمن علي','خالد ناصر','فيصل حمد','سعد ماجد','إبراهيم يوسف','حمزة عادل'];
  mem uuid[] := '{}'; stu uuid; mid uuid; i int;
  p1 uuid; p2 uuid; p5 uuid; p6 uuid; p7 uuid; pre uuid; post uuid; o uuid[]; teacher_name text;
begin
  delete from public.mh_sessions where teacher_id = uid and is_demo;
  delete from public.mh_classes where teacher_id = uid and is_demo;
  select display_name into teacher_name from public.mh_profiles where id = uid;

  insert into public.mh_classes(teacher_id, name, is_demo) values (uid, 'صف تجريبي — أسماء وهمية', true) returning id into cid;
  for i in 1..array_length(names, 1) loop
    stu := public.mh_insert_student(cid, names[i]);
  end loop;

  loop
    code := public.mh_random_code(6);
    exit when not exists (select 1 from public.mh_sessions where join_code = code);
  end loop;
  insert into public.mh_sessions(teacher_id, class_id, title, lesson, main_question, instructions, mode, duration_min, join_code, is_demo, settings)
  values (uid, cid, 'التوكل على الله والأخذ بالأسباب', 'التوكل على الله',
          'كيف يجمع المسلم بين التوكل على الله والأخذ بالأسباب في حياته اليومية؟',
          'اكتب رأيك مدعّمًا بدليل أو شاهد إن وُجد، واذكر وجه الاستدلال. ردّ على زملائك بأدب، وناقش الفكرة لا الشخص.',
          'forum', 40, code, true,
          jsonb_build_object('points_enabled', true, 'show_points_to_students', true))
  returning id into sid;
  update public.mh_sessions set status = 'open' where id = sid;
  update public.mh_sessions set opened_at = now() - interval '12 minutes' where id = sid;
  perform public.mh_timer_start(sid, 'session', 40 * 60000::bigint);
  update public.mh_timers set started_at = now() - interval '12 minutes', ends_at = now() + interval '28 minutes'
   where session_id = sid and scope = 'session';

  insert into public.mh_topics(session_id, title, body, position) values
    (sid, 'معنى التوكل وحقيقته', 'ما المقصود بالتوكل على الله؟', 0) returning id into t1;
  insert into public.mh_topics(session_id, title, body, position) values
    (sid, 'الفرق بين التوكل والتواكل', 'متى يتحول ترك العمل إلى تواكل مذموم؟', 1) returning id into t2;
  insert into public.mh_topics(session_id, title, body, position) values
    (sid, 'تطبيقات من واقع الطالب', 'كيف تطبّق التوكل في دراستك واستعدادك للاختبار؟', 2) returning id into t3;

  -- ثمانية من عشرة طلاب «حضروا» (بلا رموز وصول، فهم أسماء وهمية للعرض فقط)
  for i in 1..8 loop
    insert into public.mh_members(session_id, student_id, display_name, status, joined_at, last_seen_at)
    select sid, x.id, x.full_name, 'active', now() - interval '11 minutes', now() - interval '1 minute'
      from public.mh_students x where x.class_id = cid and x.full_name = names[i]
    returning id into mid;
    mem := mem || mid;
  end loop;
  update public.mh_members set role_label = 'مُقرّر' where id = mem[1];
  update public.mh_members set role_label = 'مُلخِّص' where id = mem[5];

  insert into public.mh_teams(session_id, name, color, position) values (sid, 'الفريق الأول', 'olive', 0) returning id into tm1;
  insert into public.mh_teams(session_id, name, color, position) values (sid, 'الفريق الثاني', 'gold', 1) returning id into tm2;
  for i in 1..8 loop
    insert into public.mh_team_members(session_id, member_id, team_id) values (sid, mem[i], case when i % 2 = 1 then tm1 else tm2 end);
  end loop;
  perform public.mh_debate_default_stages_internal(sid);

  -- مشاركات نموذجية (الأدلة توضيحية؛ حقل درجة الحديث متروك فارغًا عمدًا ليتحقق منه المعلم)
  insert into public.mh_posts(session_id, topic_id, member_id, author_name, kind, body, status, pinned, teacher_tag, team_id, client_id, created_at)
  values (sid, t1, mem[1], names[1], 'quran', 'التوكل اعتماد القلب على الله مع بذل الجهد، وليس ترك العمل.', 'approved', true, 'good_evidence', tm1, gen_random_uuid(), now() - interval '10 minutes')
  returning id into p1;
  insert into public.mh_evidence(post_id, source_type, quote, surah, ayah, reasoning)
  values (p1, 'quran', 'وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ', 'الطلاق', '3', 'الآية تبيّن أن الله كافٍ من اعتمد عليه، ولا تدل على ترك السعي.');

  insert into public.mh_posts(session_id, topic_id, member_id, author_name, kind, body, status, teacher_tag, team_id, client_id, created_at)
  values (sid, t2, mem[2], names[2], 'hadith', 'أرشد النبي ﷺ صاحب الناقة إلى أن يعقلها ثم يتوكل.', 'approved', 'needs_check', tm2, gen_random_uuid(), now() - interval '9 minutes')
  returning id into p2;
  insert into public.mh_evidence(post_id, source_type, quote, hadith_source, hadith_grade, reasoning)
  values (p2, 'hadith', '«اعقلها وتوكل»', 'سنن الترمذي', '', 'جمع الحديث بين الأخذ بالسبب (عقل الناقة) والتوكل على الله.');

  insert into public.mh_posts(session_id, topic_id, parent_id, member_id, author_name, kind, body, status, team_id, client_id, created_at)
  values (sid, t2, p2, mem[3], names[3], 'question', 'إذن هل من ترك الأسباب مع قدرته عليها يُعدّ متواكلًا؟', 'approved', tm1, gen_random_uuid(), now() - interval '8 minutes');

  insert into public.mh_posts(session_id, topic_id, member_id, author_name, kind, body, status, team_id, client_id, created_at)
  values (sid, t3, mem[4], names[4], 'example', 'الطالب الذي يذاكر بانتظام ثم يدعو الله قبل الاختبار جمع بين السبب والتوكل.', 'approved', tm2, gen_random_uuid(), now() - interval '8 minutes')
  returning id into p5;
  insert into public.mh_evidence(post_id, source_type, reasoning)
  values (p5, 'example', 'المذاكرة سبب مشروع، والدعاء وتفويض النتيجة إلى الله توكل.');

  insert into public.mh_posts(session_id, topic_id, member_id, author_name, kind, body, status, teacher_tag, team_id, client_id, created_at)
  values (sid, t1, mem[5], names[5], 'quran', 'أُمرت مريم عليها السلام بهزّ جذع النخلة مع ضعفها، وفي ذلك تعليم للأخذ بالسبب.', 'approved', 'distinguished', tm1, gen_random_uuid(), now() - interval '7 minutes')
  returning id into p6;
  insert into public.mh_evidence(post_id, source_type, quote, surah, ayah, reasoning)
  values (p6, 'quran', 'وَهُزِّي إِلَيْكِ بِجِذْعِ النَّخْلَةِ تُسَاقِطْ عَلَيْكِ رُطَبًا جَنِيًّا', 'مريم', '25', 'الله قادر على إنزال الرطب دون هزّ، لكنه أمرها بالسبب.');

  insert into public.mh_posts(session_id, topic_id, member_id, author_name, kind, body, status, team_id, client_id, created_at)
  values (sid, t2, mem[6], names[6], 'question', 'ما الفرق الدقيق بين التوكل والتواكل؟', 'approved', tm2, gen_random_uuid(), now() - interval '6 minutes');

  insert into public.mh_posts(session_id, topic_id, member_id, author_name, kind, body, status, teacher_tag, team_id, client_id, created_at)
  values (sid, t3, mem[7], names[7], 'opinion', 'أرى أن بعض الناس يظنون أن التخطيط للمستقبل ينافي التوكل.', 'approved', 'no_evidence', tm1, gen_random_uuid(), now() - interval '5 minutes')
  returning id into p7;
  insert into public.mh_posts(session_id, topic_id, parent_id, member_id, author_name, kind, body, status, team_id, client_id, created_at)
  values (sid, t3, p7, mem[1], names[1], 'rebuttal', 'التخطيط من الأخذ بالأسباب، فلا يتعارض مع التوكل ما دام القلب معلّقًا بالله.', 'approved', tm1, gen_random_uuid(), now() - interval '4 minutes');

  insert into public.mh_posts(session_id, topic_id, member_id, author_name, kind, body, status, teacher_tag, team_id, client_id, created_at)
  values (sid, t1, mem[8], names[8], 'fiqh', 'الأخذ بالأسباب المشروعة لا ينافي التوكل.', 'approved', 'incomplete', tm2, gen_random_uuid(), now() - interval '4 minutes')
  returning id into mid;
  insert into public.mh_evidence(post_id, source_type, reasoning)
  values (mid, 'fiqh', 'أحتاج إلى ذكر الدليل الذي تستند إليه هذه القاعدة.');

  insert into public.mh_posts(session_id, topic_id, member_id, author_name, kind, body, status, team_id, client_id, created_at)
  values (sid, t3, mem[2], names[2], 'opinion', 'هل يكفي الدعاء وحده قبل الاختبار إذا لم أذاكر؟', 'pending', tm2, gen_random_uuid(), now() - interval '2 minutes');

  insert into public.mh_posts(session_id, author_is_teacher, author_name, kind, body, status, client_id, created_at)
  values (sid, true, coalesce(teacher_name, 'المعلم'), 'summary',
          'خلاصة مبدئية: التوكل عمل قلبي يصاحبه بذل الأسباب المشروعة، وترك الأسباب مع القدرة عليها ليس من التوكل.',
          'approved', gen_random_uuid(), now() - interval '1 minute');

  -- تصويت قبل النقاش (مغلق) وبعده (مفتوح)
  insert into public.mh_polls(session_id, question, kind, phase, hide_results, status, opened_at, closed_at, created_at)
  values (sid, 'قبل النقاش: أي العبارات أقرب إلى فهمك للتوكل؟', 'single', 'pre', true, 'closed',
          now() - interval '12 minutes', now() - interval '10 minutes', now() - interval '12 minutes')
  returning id into pre;
  insert into public.mh_polls(session_id, question, kind, phase, hide_results, status, opened_at, created_at)
  values (sid, 'بعد النقاش: أي العبارات أقرب إلى فهمك للتوكل الآن؟', 'single', 'post', true, 'open',
          now() - interval '1 minute', now() - interval '1 minute')
  returning id into post;
  o := '{}';
  for i in 0..2 loop
    insert into public.mh_poll_options(poll_id, label, position)
    values (pre, (array['الاعتماد على الله مع بذل الأسباب','ترك الأمور دون تخطيط اعتمادًا على القدر','لست متأكدًا'])[i + 1], i)
    returning id into mid;
    o := o || mid;
  end loop;
  for i in 1..8 loop
    insert into public.mh_poll_ballots(poll_id, member_id) values (pre, mem[i]);
    insert into public.mh_poll_votes(poll_id, member_id, option_id)
    values (pre, mem[i], o[case when i <= 4 then 1 when i <= 6 then 2 else 3 end]);
  end loop;
  o := '{}';
  for i in 0..2 loop
    insert into public.mh_poll_options(poll_id, label, position)
    values (post, (array['الاعتماد على الله مع بذل الأسباب','ترك الأمور دون تخطيط اعتمادًا على القدر','لست متأكدًا'])[i + 1], i)
    returning id into mid;
    o := o || mid;
  end loop;
  for i in 1..5 loop
    insert into public.mh_poll_ballots(poll_id, member_id) values (post, mem[i]);
    insert into public.mh_poll_votes(poll_id, member_id, option_id) values (post, mem[i], o[case when i <= 4 then 1 else 3 end]);
  end loop;

  -- طلبات حديث: واحد مُنح دوره سابقًا، واثنان في الانتظار
  insert into public.mh_queue(session_id, member_id, status, requested_at, granted_at, ends_at, ended_at)
  values (sid, mem[1], 'done', now() - interval '9 minutes', now() - interval '8 minutes', now() - interval '7 minutes', now() - interval '7 minutes');
  insert into public.mh_queue(session_id, member_id, requested_at) values (sid, mem[6], now() - interval '3 minutes');
  insert into public.mh_queue(session_id, member_id, requested_at) values (sid, mem[7], now() - interval '2 minutes');

  insert into public.mh_points(session_id, member_id, delta, reason, post_id) values
    (sid, mem[1], 2, 'استدلال مناسب', p1), (sid, mem[5], 2, 'مشاركة متميزة', p6), (sid, mem[4], 1, 'مثال واقعي', p5);
  insert into public.mh_evaluations(session_id, member_id, criterion, score) values
    (sid, mem[1], 'clarity', 4), (sid, mem[1], 'reasoning', 4), (sid, mem[1], 'etiquette', 4),
    (sid, mem[2], 'reasoning', 3), (sid, mem[5], 'reasoning', 4), (sid, mem[7], 'reasoning', 2);
  update public.mh_members set teacher_note = 'استدلال واضح وربط جيد بالآية.' where id = mem[1];
  update public.mh_members set teacher_note = 'يحتاج إلى التحقق من درجة الحديث قبل الاستشهاد به.' where id = mem[2];

  perform public.mh_log(uid, sid, 'demo_seed', jsonb_build_object('note', 'بيانات تجريبية وهمية'));
  return jsonb_build_object('session_id', sid, 'class_id', cid, 'join_code', code);
end $$;

-- ------------------------- صلاحيات تنفيذ الدوال -------------------------
-- نسحب التنفيذ من الجميع لكل دوال mh_ ثم نمنحه للدوال العامة فقط.
-- تحديث: عدّ الطالب الذي أُخرج لاحقًا ضمن من دخلوا
create or replace function public.mh_report_build(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.mh_sessions := public.mh_own_session(p_session); d jsonb; r public.mh_reports; rubric jsonb;
begin
  rubric := public.mh_settings(s.settings) -> 'rubric';
  with mem as (
    select m.*,
      (select count(*) from public.mh_posts p where p.member_id = m.id and p.parent_id is null and p.status = 'approved') as posts,
      (select count(*) from public.mh_posts p where p.member_id = m.id and p.parent_id is not null and p.status = 'approved') as replies,
      (select count(*) from public.mh_posts p join public.mh_evidence e on e.post_id = p.id where p.member_id = m.id and p.status = 'approved') as evidence,
      (select count(*) from public.mh_queue q where q.member_id = m.id and q.granted_at is not null) as turns,
      (select count(*) from public.mh_poll_ballots b where b.member_id = m.id) as votes,
      (select coalesce(sum(delta), 0) from public.mh_points pt where pt.member_id = m.id) as points,
      (select count(*) from public.mh_posts p where p.member_id = m.id and p.status = 'approved' and p.teacher_tag in ('good_evidence','distinguished')) as distinguished
    from public.mh_members m where m.session_id = p_session and m.status <> 'pending'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'is_final', s.status = 'closed',
    'session', jsonb_build_object(
      'id', s.id, 'title', s.title, 'lesson', s.lesson, 'main_question', s.main_question, 'mode', s.mode, 'status', s.status,
      'is_demo', s.is_demo,
      'class_name', (select name from public.mh_classes where id = s.class_id),
      'teacher_name', (select display_name from public.mh_profiles where id = s.teacher_id),
      'date', coalesce(s.opened_at, s.created_at), 'opened_at', s.opened_at, 'closed_at', s.closed_at,
      'planned_minutes', s.duration_min,
      'actual_minutes', case when s.opened_at is not null
                             then round(extract(epoch from (coalesce(s.closed_at, now()) - s.opened_at)) / 60.0) end),
    'rubric', rubric,
    'counts', jsonb_build_object(
      'invited', case when s.class_id is not null then (select count(*) from public.mh_students x where x.class_id = s.class_id) end,
      'joined', (select count(*) from mem),
      'participated', (select count(*) from mem where (posts + replies + turns + votes) > 0),
      'posts', (select count(*) from public.mh_posts where session_id = p_session and parent_id is null and status = 'approved' and not author_is_teacher),
      'replies', (select count(*) from public.mh_posts where session_id = p_session and parent_id is not null and status = 'approved' and not author_is_teacher),
      'rejected', (select count(*) from public.mh_posts where session_id = p_session and status = 'rejected'),
      'pending', (select count(*) from public.mh_posts where session_id = p_session and status = 'pending'),
      'evidence', (select count(*) from public.mh_posts p join public.mh_evidence e on e.post_id = p.id where p.session_id = p_session and p.status = 'approved' and not p.author_is_teacher),
      'questions', (select count(*) from public.mh_posts where session_id = p_session and kind = 'question' and status = 'approved'),
      'turns', (select count(*) from public.mh_queue where session_id = p_session and granted_at is not null),
      'hand_raises', (select count(*) from public.mh_queue where session_id = p_session),
      'polls', (select count(*) from public.mh_polls where session_id = p_session and status <> 'draft'),
      'ballots', (select count(*) from public.mh_poll_ballots b join public.mh_polls pl on pl.id = b.poll_id where pl.session_id = p_session)),
    'students', coalesce((select jsonb_agg(jsonb_build_object(
        'member_id', mem.id, 'name', mem.display_name, 'status', mem.status, 'role_label', mem.role_label,
        'team', (select t.name from public.mh_team_members tm join public.mh_teams t on t.id = tm.team_id where tm.member_id = mem.id),
        'posts', mem.posts, 'replies', mem.replies, 'evidence', mem.evidence, 'turns', mem.turns, 'votes', mem.votes,
        'points', mem.points, 'distinguished', mem.distinguished, 'note', mem.teacher_note, 'grade', mem.overall_grade,
        'evaluations', (select coalesce(jsonb_object_agg(e.criterion, e.score), '{}'::jsonb) from public.mh_evaluations e where e.member_id = mem.id)
      ) order by mem.display_name) from mem), '[]'::jsonb),
    'not_joined', coalesce((select jsonb_agg(x.full_name order by x.full_name) from public.mh_students x
        where x.class_id = s.class_id and not exists (select 1 from public.mh_members m where m.session_id = p_session and m.student_id = x.id)), '[]'::jsonb),
    'low_participation', coalesce((select jsonb_agg(display_name order by display_name) from mem
        where status = 'active' and posts + replies = 0 and turns = 0), '[]'::jsonb),
    'waiting_never_granted', coalesce((select jsonb_agg(distinct m.display_name) from public.mh_queue q join public.mh_members m on m.id = q.member_id
        where q.session_id = p_session and q.status in ('skipped','waiting','withdrawn')
          and not exists (select 1 from public.mh_queue q2 where q2.member_id = q.member_id and q2.granted_at is not null)), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(jsonb_build_object('title', t.title,
        'posts', (select count(*) from public.mh_posts p where p.topic_id = t.id and p.status = 'approved')) order by t.position)
        from public.mh_topics t where t.session_id = p_session), '[]'::jsonb),
    'untopiced_posts', (select count(*) from public.mh_posts where session_id = p_session and topic_id is null and status = 'approved'),
    'key_ideas', coalesce((select jsonb_agg(jsonb_build_object('author', p.author_name, 'body', p.body, 'kind', p.kind,
        'tag', p.teacher_tag, 'pinned', p.pinned) order by p.pinned desc, p.created_at)
        from public.mh_posts p where p.session_id = p_session and p.status = 'approved' and not p.author_is_teacher
         and (p.pinned or p.teacher_tag in ('distinguished','good_evidence'))), '[]'::jsonb),
    'most_discussed', coalesce((select jsonb_agg(jsonb_build_object('author', x.author_name, 'body', x.body, 'replies', x.rc) order by x.rc desc)
        from (select p.author_name, p.body, (select count(*) from public.mh_posts c where c.parent_id = p.id and c.status = 'approved') rc
              from public.mh_posts p where p.session_id = p_session and p.parent_id is null and p.status = 'approved'
              order by rc desc, p.created_at limit 5) x where x.rc > 0), '[]'::jsonb),
    'unanswered_questions', coalesce((select jsonb_agg(jsonb_build_object('author', p.author_name, 'body', p.body) order by p.created_at)
        from public.mh_posts p where p.session_id = p_session and p.kind = 'question' and p.status = 'approved'
         and not exists (select 1 from public.mh_posts c where c.parent_id = p.id and c.status = 'approved')), '[]'::jsonb),
    'teacher_summaries', coalesce((select jsonb_agg(p.body order by p.created_at) from public.mh_posts p
        where p.session_id = p_session and p.author_is_teacher and p.kind = 'summary'), '[]'::jsonb),
    'kinds', coalesce((select jsonb_object_agg(kind, c) from (select kind, count(*) c from public.mh_posts
        where session_id = p_session and status = 'approved' and not author_is_teacher group by kind) k), '{}'::jsonb),
    'tags', coalesce((select jsonb_object_agg(teacher_tag, c) from (select teacher_tag, count(*) c from public.mh_posts
        where session_id = p_session and teacher_tag is not null group by teacher_tag) k), '{}'::jsonb),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('name', t.name,
        'members', (select count(*) from public.mh_team_members tm where tm.team_id = t.id),
        'posts', (select count(*) from public.mh_posts p where p.team_id = t.id and p.status = 'approved')) order by t.position)
        from public.mh_teams t where t.session_id = p_session), '[]'::jsonb),
    'polls', coalesce((select jsonb_agg(jsonb_build_object('question', pl.question, 'phase', pl.phase, 'kind', pl.kind, 'status', pl.status,
        'opened_at', pl.opened_at, 'closed_at', pl.closed_at,
        'ballots', (select count(*) from public.mh_poll_ballots b where b.poll_id = pl.id),
        'options', (select jsonb_agg(jsonb_build_object('label', o.label,
                      'count', (select count(*) from public.mh_poll_votes v where v.option_id = o.id)) order by o.position)
                    from public.mh_poll_options o where o.poll_id = pl.id)) order by pl.created_at)
        from public.mh_polls pl where pl.session_id = p_session and pl.status <> 'draft'), '[]'::jsonb)
  ) into d;

  insert into public.mh_reports(session_id, data) values (p_session, d)
  on conflict (session_id) do update set data = excluded.data, generated_at = now()
  returning * into r;
  return jsonb_build_object('data', r.data, 'teacher_summary', r.teacher_summary, 'generated_at', r.generated_at);
end $$;

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
