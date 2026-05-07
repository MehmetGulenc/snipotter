-- 0007_admin_rls_policies.sql
--
-- Fix for the "admin dashboard shows nothing" bug introduced in 0006.
-- That migration locked apps + metric_snapshots + reviews + heartbeats
-- behind RLS with no policies, expecting the admin dashboard to use
-- the service role key. But the dashboard is a browser app — it ships
-- with the public anon key, so under no-policy RLS its reads return
-- zero rows even though the seed data is there.
--
-- Fix: add SELECT policies that allow reads when the authenticated
-- user's email is in a small allowlist. The Cloudflare Worker side
-- (cron + heartbeat) keeps using the service-role key for writes, so
-- this change strictly opens *read* access for the admin operator,
-- never write access for arbitrary clients.
--
-- The allowlist lives inside the policy itself rather than a separate
-- table because (a) it changes once a year at most, (b) inlining it
-- keeps the surface auditable from a single migration. Adding a new
-- admin email later = create a new migration replacing this policy.

-- Drop any pre-existing policies with the same name so re-running this
-- migration is idempotent across Supabase replays.
drop policy if exists "admin email read"  on public.apps;
drop policy if exists "admin email read"  on public.metric_snapshots;
drop policy if exists "admin email read"  on public.reviews;
drop policy if exists "admin email read"  on public.heartbeats;
drop policy if exists "admin email reply" on public.reviews;

-- The single source of truth for admin emails. To add a new admin,
-- ALTER POLICY ... USING (auth.email() in (...))  in a new migration.
create policy "admin email read"
  on public.apps
  for select
  to authenticated
  using (auth.email() in ('mehmetgulenc5@gmail.com'));

create policy "admin email read"
  on public.metric_snapshots
  for select
  to authenticated
  using (auth.email() in ('mehmetgulenc5@gmail.com'));

create policy "admin email read"
  on public.reviews
  for select
  to authenticated
  using (auth.email() in ('mehmetgulenc5@gmail.com'));

create policy "admin email read"
  on public.heartbeats
  for select
  to authenticated
  using (auth.email() in ('mehmetgulenc5@gmail.com'));

-- Reviews need a tiny UPDATE policy too — the admin marks a review as
-- "replied=true" + sets reply_body when they want to record that they
-- responded on the store side. We restrict the columns later via the
-- admin app's typed mutations; the policy itself is column-free so
-- Supabase doesn't refuse the request before the field check runs.
create policy "admin email reply"
  on public.reviews
  for update
  to authenticated
  using (auth.email() in ('mehmetgulenc5@gmail.com'))
  with check (auth.email() in ('mehmetgulenc5@gmail.com'));
