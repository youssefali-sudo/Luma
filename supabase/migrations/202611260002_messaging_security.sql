-- LUMA messaging hardening and realtime indexes.
-- Fix an authorization flaw in the initial conversation membership policy:
-- users must not be able to join arbitrary private conversations themselves.
drop policy if exists "conversation creator can add members" on public.conversation_members;
create policy "conversation creators add members" on public.conversation_members
for insert to authenticated
with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.created_by = (select auth.uid())
  )
);

create index if not exists messages_conversation_ascending_idx
  on public.messages(conversation_id, created_at asc);
create index if not exists messages_space_ascending_idx
  on public.messages(space_id, created_at asc);
create index if not exists conversation_members_user_recent_idx
  on public.conversation_members(user_id, joined_at desc);

-- Make sure message changes are available to Supabase Realtime even if a
-- project already has a customized publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
