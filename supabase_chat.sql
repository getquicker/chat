-- SimpleChat: search, start conversation, hide chat for current user only
-- Run once in Supabase → SQL Editor → Run

-- Allow authenticated users to find other profiles (needed for New chat search)
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
on public.profiles for select to authenticated
using (true);

-- Search users by username / display name
create or replace function public.search_users(query text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and (
      p.username ilike '%' || lower(trim(query)) || '%'
      or coalesce(p.display_name, '') ilike '%' || trim(query) || '%'
    )
  order by p.username
  limit 20;
$$;

grant execute on function public.search_users(text) to authenticated;

-- Get existing 1:1 conversation or create a new one
create or replace function public.get_or_create_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing uuid;
  new_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if other_user_id is null or other_user_id = me then
    raise exception 'Invalid user';
  end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'User not found';
  end if;

  select cm1.conversation_id into existing
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm2.conversation_id = cm1.conversation_id
   and cm2.user_id = other_user_id
  where cm1.user_id = me
  limit 1;

  if existing is not null then
    if not exists (
      select 1 from public.conversation_members
      where conversation_id = existing and user_id = me
    ) then
      insert into public.conversation_members (conversation_id, user_id)
      values (existing, me);
    end if;
    return existing;
  end if;

  -- Also check if other user still has a conversation that I left
  select cm2.conversation_id into existing
  from public.conversation_members cm2
  where cm2.user_id = other_user_id
    and exists (
      select 1 from public.messages m
      where m.conversation_id = cm2.conversation_id
        and (m.sender_id = me or m.sender_id = other_user_id)
    )
  limit 1;

  insert into public.conversations default values
  returning id into new_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (new_id, me), (new_id, other_user_id);

  return new_id;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid) to authenticated;

-- Hide / delete chat for ME only (other user keeps the chat)
create or replace function public.hide_conversation(p_conversation_id uuid)
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

  delete from public.conversation_members
  where conversation_id = p_conversation_id
    and user_id = auth.uid();

  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id
  ) then
    delete from public.messages where conversation_id = p_conversation_id;
    delete from public.conversations where id = p_conversation_id;
  end if;

  return true;
end;
$$;

grant execute on function public.hide_conversation(uuid) to authenticated;

-- Make delete_conversation = hide for me only (not wipe for everyone)
create or replace function public.delete_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.hide_conversation(p_conversation_id);
end;
$$;

grant execute on function public.delete_conversation(uuid) to authenticated;
