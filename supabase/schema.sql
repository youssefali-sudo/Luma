-- LUMA production foundation — run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create type public.space_kind as enum ('group', 'channel');
create type public.member_role as enum ('owner', 'admin', 'member');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9_.]{3,24}$'),
  display_name text not null default 'عضو جديد' check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 180),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  kind public.space_kind not null,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique,
  description text not null default '' check (char_length(description) <= 500),
  is_private boolean not null default false,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 10000),
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint check (attachment_size is null or attachment_size <= 52428800),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint message_destination_check check (
    (conversation_id is not null and space_id is null) or
    (conversation_id is null and space_id is not null)
  ),
  constraint message_content_check check (
    char_length(body) > 0 or attachment_path is not null
  )
);
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_path text,
  caption text not null default '' check (char_length(caption) <= 500),
  background text not null default '#8b5cf6',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create table public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index messages_space_created_idx on public.messages(space_id, created_at desc);
create index stories_active_idx on public.stories(expires_at desc);
create index space_members_user_idx on public.space_members(user_id, joined_at desc);
create index conversation_members_user_idx on public.conversation_members(user_id, joined_at desc);

-- Create a profile for each new authenticated account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  base_name text;
begin
  base_name := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'member'), '[^a-zA-Z0-9_.]', '', 'g'));
  base_name := left(base_name, 18);
  if char_length(base_name) < 3 then base_name := 'member'; end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, base_name || '_' || substr(new.id::text, 1, 5), coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'عضو جديد'));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_space_member(target_space uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.space_members sm
    where sm.space_id = target_space and sm.user_id = (select auth.uid())
  );
$$;
create or replace function public.is_conversation_member(target_conversation uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = target_conversation and cm.user_id = (select auth.uid())
  );
$$;

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.message_reactions enable row level security;

create policy "profiles readable to signed in users" on public.profiles for select to authenticated using (true);
create policy "users create own profile" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "users update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "public spaces discoverable, private spaces for members" on public.spaces for select to authenticated
using (not is_private or owner_id = (select auth.uid()) or public.is_space_member(id));
create policy "authenticated users create spaces" on public.spaces for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners and admins update spaces" on public.spaces for update to authenticated
using (exists (select 1 from public.space_members sm where sm.space_id = id and sm.user_id = (select auth.uid()) and sm.role in ('owner','admin')) or owner_id = (select auth.uid()))
with check (exists (select 1 from public.space_members sm where sm.space_id = id and sm.user_id = (select auth.uid()) and sm.role in ('owner','admin')) or owner_id = (select auth.uid()));
create policy "members visible to other members" on public.space_members for select to authenticated
using (public.is_space_member(space_id) or exists (select 1 from public.spaces s where s.id = space_id and not s.is_private));
create policy "users may join public spaces" on public.space_members for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.spaces s where s.id = space_id and not s.is_private));
create policy "users can leave spaces, admins manage roles" on public.space_members for delete to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.space_members admin where admin.space_id = space_id and admin.user_id = (select auth.uid()) and admin.role in ('owner','admin')));

create policy "conversation members can view conversations" on public.conversations for select to authenticated
using (public.is_conversation_member(id) or created_by = (select auth.uid()));
create policy "users can create conversations" on public.conversations for insert to authenticated with check (created_by = (select auth.uid()));
create policy "members can see conversation membership" on public.conversation_members for select to authenticated
using (public.is_conversation_member(conversation_id) or user_id = (select auth.uid()));
create policy "conversation creator can add members" on public.conversation_members for insert to authenticated
with check (user_id = (select auth.uid()) or exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = (select auth.uid())));
create policy "users can leave conversations" on public.conversation_members for delete to authenticated using (user_id = (select auth.uid()));

create policy "messages visible to destination members" on public.messages for select to authenticated
using (
  (conversation_id is not null and public.is_conversation_member(conversation_id))
  or (space_id is not null and (public.is_space_member(space_id) or exists (select 1 from public.spaces s where s.id = space_id and not s.is_private)))
);
create policy "members send messages as themselves" on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid()) and (
    (conversation_id is not null and public.is_conversation_member(conversation_id))
    or (space_id is not null and public.is_space_member(space_id))
  )
);
create policy "authors can edit own messages" on public.messages for update to authenticated
using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));
create policy "authors can delete own messages" on public.messages for delete to authenticated using (sender_id = (select auth.uid()));

create policy "active stories readable to signed in users" on public.stories for select to authenticated using (expires_at > now());
create policy "users create own stories" on public.stories for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users delete own stories" on public.stories for delete to authenticated using (user_id = (select auth.uid()));
create policy "story owner or viewer can read views" on public.story_views for select to authenticated
using (viewer_id = (select auth.uid()) or exists (select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid())));
create policy "users mark own story views" on public.story_views for insert to authenticated with check (viewer_id = (select auth.uid()));
create policy "reactions visible to message members" on public.message_reactions for select to authenticated using (
  exists (select 1 from public.messages m where m.id = message_id and (
    (m.conversation_id is not null and public.is_conversation_member(m.conversation_id))
    or (m.space_id is not null and public.is_space_member(m.space_id))
  ))
);
create policy "users manage own reactions" on public.message_reactions for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Realtime message events.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.stories;
