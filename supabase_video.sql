-- SimpleChat video calling: run once in Supabase SQL Editor.
-- Uses WebRTC for media and this table only for call signaling.

create table if not exists public.call_signals (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('offer', 'answer', 'ice-candidate', 'hangup', 'decline', 'busy')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists call_signals_conversation_created_idx
  on public.call_signals (conversation_id, created_at desc);
create index if not exists call_signals_recipient_created_idx
  on public.call_signals (recipient_id, created_at desc);

alter table public.call_signals enable row level security;

drop policy if exists "Conversation members can read call signals" on public.call_signals;
create policy "Conversation members can read call signals"
on public.call_signals for select to authenticated
using (
  exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = call_signals.conversation_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "Members can send call signals to conversation peers" on public.call_signals;
create policy "Members can send call signals to conversation peers"
on public.call_signals for insert to authenticated
with check (
  sender_id = auth.uid()
  and sender_id <> recipient_id
  and exists (
    select 1 from public.conversation_members sender_member
    join public.conversation_members recipient_member
      on recipient_member.conversation_id = sender_member.conversation_id
    where sender_member.conversation_id = call_signals.conversation_id
      and sender_member.user_id = auth.uid()
      and recipient_member.user_id = call_signals.recipient_id
  )
);

grant select, insert on public.call_signals to authenticated;
grant usage, select on sequence public.call_signals_id_seq to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.call_signals;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
