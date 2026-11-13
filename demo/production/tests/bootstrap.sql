-- Emulates only Supabase's identity/storage metadata contracts in real PostgreSQL (PGlite).
-- Auth token validation, hosted storage transport and pg_cron require hosted smoke testing.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create schema storage;
-- Supabase sets this request-local operation before it evaluates Storage RLS.
create function storage.allow_only_operation(expected_operation text) returns boolean language sql stable as $$
 select coalesce(regexp_replace(current_setting('storage.operation',true),'^storage[.]','')=regexp_replace(expected_operation,'^storage[.]',''),false)
$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
