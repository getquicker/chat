-- Run once: makes "delete for me" reliable
-- Leaves membership for current user only; other user keeps the chat

-- Allow a user to remove only their own membership row
drop policy if exists "Members can leave a conversation" on public.conversation_members;
create policy "Members can leave a conversation"
on public.conversation_members
for delete
to authenticated
using (user_id = auth.uid());

-- Hide / delete for me
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

  delete from public.conversation_members
  where conversation_id = p_conversation_id
    and user_id = auth.uid();

  -- Only wipe fully if nobody left
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
