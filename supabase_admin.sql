-- Kurakani admin: verified badges
-- Run once in Supabase → SQL Editor

alter table public.profiles
  add column if not exists is_verified boolean not null default false;

create or replace function public.change_username(new_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_username text := lower(trim(new_username));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if clean_username !~ '^[a-z0-9_.]{3,24}$' then
    raise exception 'Username must be 3-24 characters using letters, numbers, underscore or period';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(username) = clean_username
      and id <> auth.uid()
  ) then
    raise exception 'Username already taken';
  end if;

  update public.profiles
  set username = clean_username
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found';
  end if;

  return clean_username;
end;
$$;

grant execute on function public.change_username(text) to authenticated;

create or replace function public.admin_list_profiles(p_admin_pass text)
returns table (
  id uuid,
  username text,
  display_name text,
  is_verified boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_admin_pass is distinct from 'admin18110' then
    raise exception 'Unauthorized';
  end if;

  return query
  select p.id, p.username, p.display_name, coalesce(p.is_verified, false)
  from public.profiles p
  order by p.username;
end;
$$;

grant execute on function public.admin_list_profiles(text) to anon, authenticated, public;

create or replace function public.admin_set_verified(
  p_username text,
  p_verified boolean,
  p_admin_pass text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := lower(trim(p_username));
begin
  if p_admin_pass is distinct from 'admin18110' then
    raise exception 'Unauthorized';
  end if;

  update public.profiles
  set is_verified = coalesce(p_verified, false)
  where lower(username) = clean;

  return found;
end;
$$;

grant execute on function public.admin_set_verified(text, boolean, text) to anon, authenticated, public;
