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

-- Prevent ordinary authenticated users from verifying their own account by updating profiles.
create or replace function public.prevent_self_verification()
returns trigger
language plpgsql
set search_path = public
as $
begin
  if new.is_verified is distinct from old.is_verified
     and current_user not in ('postgres', 'supabase_admin', 'service_role')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only an administrator can change verified status';
  end if;
  return new;
end;
$;

drop trigger if exists profiles_prevent_self_verification on public.profiles;
create trigger profiles_prevent_self_verification
before update of is_verified on public.profiles
for each row execute function public.prevent_self_verification();

revoke all on function public.prevent_self_verification() from public;
revoke all on function public.prevent_self_verification() from anon;
revoke all on function public.prevent_self_verification() from authenticated;

comment on column public.profiles.is_verified is
  'Administrative verified-account badge flag. Defaults to false; only trusted administrators should change it.';
