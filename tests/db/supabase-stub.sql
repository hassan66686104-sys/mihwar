-- محاكاة الحد الأدنى من بيئة Supabase لاختبار migrations محليًا على PostgreSQL عادي.
-- لا يُستخدم هذا الملف في الإنتاج.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
create schema if not exists realtime;
create table if not exists realtime.sent (id bigserial primary key, topic text, event text, payload jsonb, private boolean, at timestamptz default now());
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql as $$ insert into realtime.sent(topic, event, payload, private) values (topic, event, payload, private) $$;
grant usage on schema public to anon, authenticated;
