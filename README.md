# LUMA — Social Platform MVP

LUMA is a Next.js 15 + TypeScript social platform foundation. The production feed is connected to Supabase Auth, Postgres, Storage, and Realtime; there are no hard-coded demo posts in the authenticated feed.

## Included in this phase

- Email/password sign-up and sign-in at `/login` using Supabase Auth.
- User profiles with unique usernames, display names, and bios.
- Database-backed social feed and profile pages.
- Image/video post uploads to Supabase Storage (50 MB maximum per upload).
- 24-hour stories, likes, comments, follows, and activity notifications.
- Row Level Security (RLS) policies for the social tables and per-user upload folders.
- Realtime refresh for posts, likes, and stories.

Direct messages, group/channel management UI, full notification preferences, moderation tools, and mobile app packaging are not yet complete. The existing database schema contains an initial model for conversations and spaces; those screens will be connected in the next phase.

## Local development

1. Use Node.js 20 or newer.
2. Install packages: `npm install`
3. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and anon/publishable key.
4. Run `npm run dev` and open `http://localhost:3000`.

Required public environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Never put a Supabase `service_role` key in browser code or any `NEXT_PUBLIC_*` variable.

## Supabase setup

1. Create a project in the Supabase dashboard.
2. Open **SQL Editor** and run `supabase/schema.sql` first.
3. Then run `supabase/migrations/202611260001_social_core.sql`.
4. In **Authentication → URL Configuration**, add your deployed site URL to Site URL and add the local and production callback URLs to Redirect URLs.
5. Add the two environment variables above to your local environment and your hosting provider (for example, Vercel → Project → Settings → Environment Variables), then redeploy.

The SQL creates the profile/conversation foundation, social tables, RLS policies, the `luma-media` storage bucket, and activity notifications. Review policies before making the service public and add rate limiting/moderation before a broad launch.

## CI

GitHub Actions runs TypeScript checks and `next build` on pushes and pull requests to `main`. A successful CI run validates compilation, not the availability of your Supabase project or production deployment.
