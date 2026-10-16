-- SimpleChat auth helpers
-- Run this ONCE in Supabase → SQL Editor → New query → Run
-- Required for username login and signup username checks.

-- Lookup email by username (used at login before the user is authenticated)
create or replace function public.email_for_username(wanted_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result text;
  clean text := lower(trim(wanted_username));
begin
  if clean is null or clean = '' then
    return null;
  end if;

  select u.email into result
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = clean
  limit 1;

  return result;
end;
$$;

-- Must be callable while logged out (login form)
grant execute on function public.email_for_username(text) to anon, authenticated, public;

-- Check if a username is free (signup)
create or replace function public.username_available(wanted_username text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := lower(trim(wanted_username));
begin
  if clean is null or clean = '' then
    return false;
  end if;

  return not exists (
    select 1 from public.profiles
    where lower(username) = clean
  );
end;
$$;

grant execute on function public.username_available(text) to anon, authenticated, public;
