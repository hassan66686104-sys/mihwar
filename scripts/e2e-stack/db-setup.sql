-- تهيئة قاعدة بيانات الاختبار الشامل (e2e) لتشبه بيئة Supabase:
-- أدوار PostgREST وAuth، ومخطط auth يملكه خادم Auth الحقيقي (supabase/auth) الذي ينشئ جداوله بنفسه،
-- و realtime.send بديل يرسل NOTIFY تلتقطه بوابة الاختبار. لا يُستخدم في الإنتاج.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin login createrole; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to supabase_auth_admin;
create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;
grant create on database current_database_placeholder to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;

create schema if not exists realtime;
create table if not exists realtime.sent (id bigserial primary key, topic text, event text, payload jsonb, private boolean, at timestamptz default now());
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language plpgsql as $$
begin
  insert into realtime.sent(topic, event, payload, private) values (topic, event, payload, private);
  perform pg_notify('mh_realtime', jsonb_build_object('topic', topic, 'event', event, 'payload', payload, 'private', private)::text);
end $$;
grant usage on schema public to anon, authenticated, service_role;
