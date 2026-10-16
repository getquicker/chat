-- Professional "delete for me" + auto-reopen when the other person messages again
-- Run once in Supabase → SQL Editor → Run

alter table public.conversation_members
  add column if not exists hidden_at timestamptz;

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

  update public.conversation_members
  set hidden_at = now()
  where conversation_id = p_conversation_id
    and user_id = auth.uid();

  return true;
end;
$$;

grant execute on function public.hide_conversation(uuid) to authenticated;

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

-- When a message is sent: un-hide chat for everyone + re-add peers who fully left
create or replace function public.on_message_reopen_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  peer_id uuid;
begin
  insert into public.conversation_members (conversation_id, user_id)
  select new.conversation_id, new.sender_id
  where not exists (
    select 1 from public.conversation_members
    where conversation_id = new.conversation_id
      and user_id = new.sender_id
  );

  -- Show chat again for anyone who had deleted/hidden it
  update public.conversation_members
  set hidden_at = null
  where conversation_id = new.conversation_id
    and hidden_at is not null;

  -- Re-add past participants who hard-left (no membership row)
  for peer_id in
    select distinct m.sender_id
    from public.messages m
    where m.conversation_id = new.conversation_id
      and m.sender_id <> new.sender_id
  loop
    insert into public.conversation_members (conversation_id, user_id)
    select new.conversation_id, peer_id
    where not exists (
      select 1 from public.conversation_members
      where conversation_id = new.conversation_id
        and user_id = peer_id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_message_reopen_chat on public.messages;
create trigger trg_message_reopen_chat
after insert on public.messages
for each row
execute function public.on_message_reopen_chat();

-- Starting a chat again also clears hide for me
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
  if me is null then raise exception 'Not authenticated'; end if;
  if other_user_id is null or other_user_id = me then raise exception 'Invalid user'; end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'User not found';
  end if;

  select cm1.conversation_id into existing
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm2.conversation_id = cm1.conversation_id and cm2.user_id = other_user_id
  where cm1.user_id = me
  limit 1;

  if existing is not null then
    update public.conversation_members
    set hidden_at = null
    where conversation_id = existing and user_id = me;
    return existing;
  end if;

  select cm.conversation_id into existing
  from public.conversation_members cm
  where cm.user_id = other_user_id
    and exists (
      select 1 from public.messages m
      where m.conversation_id = cm.conversation_id
        and (m.sender_id = me or m.sender_id = other_user_id)
    )
    and not exists (
      select 1 from public.conversation_members cm3
      where cm3.conversation_id = cm.conversation_id
        and cm3.user_id not in (me, other_user_id)
    )
  limit 1;

  if existing is not null then
    insert into public.conversation_members (conversation_id, user_id)
    select existing, me
    where not exists (
      select 1 from public.conversation_members
      where conversation_id = existing and user_id = me
    );
    update public.conversation_members
    set hidden_at = null
    where conversation_id = existing and user_id = me;
    return existing;
  end if;

  insert into public.conversations default values returning id into new_id;
  insert into public.conversation_members (conversation_id, user_id)
  values (new_id, me), (new_id, other_user_id);
  return new_id;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid) to authenticated;

drop function if exists public.get_my_chats();

create function public.get_my_chats()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  unread_count bigint
)
language sql
security definer
set search_path = public
as $$
  with my_convs as (
    select cm.conversation_id
    from public.conversation_members cm
    where cm.user_id = auth.uid()
      and cm.hidden_at is null
  ),
  peer as (
    select
      mc.conversation_id,
      coalesce(
        (select cm2.user_id from public.conversation_members cm2
          where cm2.conversation_id = mc.conversation_id and cm2.user_id <> auth.uid() limit 1),
        (select m.sender_id from public.messages m
          where m.conversation_id = mc.conversation_id and m.sender_id <> auth.uid()
          order by m.created_at desc limit 1)
      ) as other_user_id
    from my_convs mc
  ),
  last_msg as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.body as last_message,
      m.created_at as last_message_at,
      m.sender_id as last_sender_id
    from public.messages m
    join my_convs mc on mc.conversation_id = m.conversation_id
    order by m.conversation_id, m.created_at desc
  )
  select
    p.conversation_id,
    p.other_user_id,
    pr.username as other_username,
    pr.display_name as other_display_name,
    pr.avatar_url as other_avatar_url,
    lm.last_message,
    lm.last_message_at,
    lm.last_sender_id,
    0::bigint as unread_count
  from peer p
  left join public.profiles pr on pr.id = p.other_user_id
  left join last_msg lm on lm.conversation_id = p.conversation_id
  order by coalesce(lm.last_message_at, '-infinity'::timestamptz) desc;
$$;

grant execute on function public.get_my_chats() to authenticated;

drop policy if exists "Members can update own membership hide" on public.conversation_members;
create policy "Members can update own membership hide"
on public.conversation_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
