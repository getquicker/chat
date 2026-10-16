-- Professional "delete for me" + auto-reopen when the other person messages again
-- Run once in Supabase → SQL Editor → Run

-- Soft-hide flag (preferred over removing membership)
alter table public.conversation_members
  add column if not exists hidden_at timestamptz;

-- P1 deletes chat → only hide for P1
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

-- When anyone sends a message, un-hide the chat for all OTHER members
-- and ensure sender is a member (covers old hard-leave rows)
create or replace function public.on_message_reopen_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  peer_id uuid;
begin
  -- Sender must be a member
  insert into public.conversation_members (conversation_id, user_id)
  select new.conversation_id, new.sender_id
  where not exists (
    select 1 from public.conversation_members
    where conversation_id = new.conversation_id
      and user_id = new.sender_id
  );

  -- Un-hide for everyone except we still un-hide all (including sender)
  update public.conversation_members
  set hidden_at = null
  where conversation_id = new.conversation_id
    and hidden_at is not null;

  -- If peer left entirely (old hard-delete), re-add them from message history
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

  -- Also: if only one member exists, try other_user from any remaining membership history is N/A
  -- For classic 1:1 where peer only exists as the non-sender in members table already handled

  return new;
end;
$$;

drop trigger if exists trg_message_reopen_chat on public.messages;
create trigger trg_message_reopen_chat
after insert on public.messages
for each row
execute function public.on_message_reopen_chat();

-- Chat list: only conversations not hidden for me
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

-- Allow members to update their own hidden_at (client fallback)
drop policy if exists "Members can update own membership hide" on public.conversation_members;
create policy "Members can update own membership hide"
on public.conversation_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
