-- LUMA social core migration. Safe to apply after supabase/schema.sql.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 2200),
  media_path text,
  media_mime text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_content_check check (char_length(caption) > 0 or media_path is not null)
);
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1500),
  created_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('follow','like','comment')),
  post_id uuid references public.posts(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_author_created_idx on public.posts(author_id, created_at desc);
create index if not exists follows_following_idx on public.follows(following_id, created_at desc);
create index if not exists comments_post_created_idx on public.post_comments(post_id, created_at desc);
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);

alter table public.posts enable row level security;
alter table public.follows enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "signed in users read posts" on public.posts;
create policy "signed in users read posts" on public.posts for select to authenticated using (true);
drop policy if exists "users publish own posts" on public.posts;
create policy "users publish own posts" on public.posts for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists "authors edit own posts" on public.posts;
create policy "authors edit own posts" on public.posts for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists "authors delete own posts" on public.posts;
create policy "authors delete own posts" on public.posts for delete to authenticated using (author_id = (select auth.uid()));

drop policy if exists "signed in users read follows" on public.follows;
create policy "signed in users read follows" on public.follows for select to authenticated using (true);
drop policy if exists "users follow as themselves" on public.follows;
create policy "users follow as themselves" on public.follows for insert to authenticated with check (follower_id = (select auth.uid()) and following_id <> (select auth.uid()));
drop policy if exists "users unfollow as themselves" on public.follows;
create policy "users unfollow as themselves" on public.follows for delete to authenticated using (follower_id = (select auth.uid()));

drop policy if exists "signed in users read likes" on public.post_likes;
create policy "signed in users read likes" on public.post_likes for select to authenticated using (true);
drop policy if exists "users like as themselves" on public.post_likes;
create policy "users like as themselves" on public.post_likes for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "users remove own likes" on public.post_likes;
create policy "users remove own likes" on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "signed in users read comments" on public.post_comments;
create policy "signed in users read comments" on public.post_comments for select to authenticated using (true);
drop policy if exists "users comment as themselves" on public.post_comments;
create policy "users comment as themselves" on public.post_comments for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists "authors delete own comments" on public.post_comments;
create policy "authors delete own comments" on public.post_comments for delete to authenticated using (author_id = (select auth.uid()));

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications" on public.notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- Public read for published media; authenticated users can only upload to their own UUID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('luma-media', 'luma-media', true, 52428800, array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','application/pdf','text/plain','application/zip'])
on conflict (id) do update set public = true, file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','application/pdf','text/plain','application/zip'];

drop policy if exists "luma media public read" on storage.objects;
create policy "luma media public read" on storage.objects for select using (bucket_id = 'luma-media');
drop policy if exists "luma media upload own folder" on storage.objects;
create policy "luma media upload own folder" on storage.objects for insert to authenticated
with check (bucket_id = 'luma-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "luma media update own folder" on storage.objects;
create policy "luma media update own folder" on storage.objects for update to authenticated
using (bucket_id = 'luma-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'luma-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "luma media delete own folder" on storage.objects;
create policy "luma media delete own folder" on storage.objects for delete to authenticated
using (bucket_id = 'luma-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Create a notification when someone follows a user, likes a post, or comments.
create or replace function public.notify_social_activity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare target_user uuid; target_post uuid; activity_kind text;
begin
  if tg_table_name = 'follows' then
    target_user := new.following_id; activity_kind := 'follow';
  elsif tg_table_name = 'post_likes' then
    target_post := new.post_id; activity_kind := 'like';
    select author_id into target_user from public.posts where id = new.post_id;
  else
    target_post := new.post_id; activity_kind := 'comment';
    select author_id into target_user from public.posts where id = new.post_id;
  end if;
  if target_user is not null and target_user <> new.follower_id and target_user <> new.user_id and target_user <> new.author_id then
    insert into public.notifications(recipient_id, actor_id, kind, post_id)
    values (target_user, auth.uid(), activity_kind, target_post);
  end if;
  return new;
end;
$$;
drop trigger if exists notify_follow_activity on public.follows;
create trigger notify_follow_activity after insert on public.follows for each row execute function public.notify_social_activity();
drop trigger if exists notify_like_activity on public.post_likes;
create trigger notify_like_activity after insert on public.post_likes for each row execute function public.notify_social_activity();
drop trigger if exists notify_comment_activity on public.post_comments;
create trigger notify_comment_activity after insert on public.post_comments for each row execute function public.notify_social_activity();

-- Keep public profile reads and existing message/group policies in the original schema.
