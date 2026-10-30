-- Kurakani admin: verified badges + name sanitize
-- Run once in Supabase → SQL Editor

alter table public.profiles
  add column if not exists is_verified boolean not null default false;

create or replace function public.profiles_sanitize_name()
returns trigger
language plpgsql
as $$
begin
  if NEW.display_name is not null then
    NEW.display_name := trim(regexp_replace(NEW.display_name, '[^A-Za-z ]', '', 'g'));
    NEW.display_name := regexp_replace(NEW.display_name, '\s+', ' ', 'g');
    if NEW.display_name = '' then
      NEW.display_name := NEW.username;
    end if;
  end if;
  if NEW.username is not null then
    NEW.username := lower(trim(NEW.username));
    if NEW.username !~ '^[a-z0-9_.]{3,24}$' then
      raise exception 'Invalid username';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_sanitize_name_trg on public.profiles;
create trigger profiles_sanitize_name_trg
  before insert or update of display_name, username
  on public.profiles
  for each row execute function public.profiles_sanitize_name();

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

create or replace function public.list_verified_usernames()
returns table (username text)
language sql
security definer
set search_path = public
stable
as $$
  select p.username
  from public.profiles p
  where coalesce(p.is_verified, false) = true;
$$;

grant execute on function public.list_verified_usernames() to anon, authenticated, public;

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
