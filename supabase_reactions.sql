-- Shared message reactions
-- messages.id is bigint in this project (not uuid)

drop table if exists public.message_reactions cascade;

create table public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_id_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

drop policy if exists "reactions_select_members" on public.message_reactions;
create policy "reactions_select_members"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_reactions.message_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists "reactions_insert_own" on public.message_reactions;
create policy "reactions_insert_own"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_reactions.message_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists "reactions_delete_own" on public.message_reactions;
create policy "reactions_delete_own"
  on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end $$;

grant select, insert, delete on public.message_reactions to authenticated;
