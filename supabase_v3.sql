-- SimpleChat v3: username changes + chat deletion
-- Run this once in Supabase SQL Editor.

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

  if clean_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must be 3-24 characters using letters, numbers or underscore';
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

create or replace function public.delete_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
  ) then
    raise exception 'Conversation not found';
  end if;

  delete from public.messages
  where conversation_id = p_conversation_id;

  delete from public.conversation_members
  where conversation_id = p_conversation_id;

  delete from public.conversations
  where id = p_conversation_id;

  return true;
end;
$$;

grant execute on function public.delete_conversation(uuid) to authenticated;
