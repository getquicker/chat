-- Kurakani verified-account badge support.
-- Run once in Supabase SQL Editor after the profiles table exists.
-- Accounts remain unverified by default; an administrator must explicitly set is_verified = true.

alter table public.profiles
  add column if not exists is_verified boolean not null default false;

create or replace function public.list_verified_usernames()
returns table (username text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.username, p.display_name
  from public.profiles p
  where p.is_verified = true
    and p.username is not null;
$$;

revoke all on function public.list_verified_usernames() from public;
revoke all on function public.list_verified_usernames() from anon;
grant execute on function public.list_verified_usernames() to authenticated;

comment on column public.profiles.is_verified is
  'Administrative verified-account badge flag. Defaults to false; only trusted administrators should change it.';
