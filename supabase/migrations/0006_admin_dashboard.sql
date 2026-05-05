-- 0006_admin_dashboard.sql
--
-- Admin dashboard schema. Stores aggregated metrics + reviews + per-device
-- heartbeats so admin.snipotter.com can show a unified "all my apps, all
-- my platforms" view without having to log into Microsoft Partner Center,
-- Google Play, GitHub Releases, Cloudflare Analytics, and Supabase one by
-- one.
--
-- Multi-app from day one: Snipotter Desktop is the first row of the apps
-- table, but the schema accepts arbitrary additional apps without
-- migration churn (Snipotter Android, future products, etc.).
--
-- Write path:
--   • Cloudflare cron worker (workers/cron) hits each source API once a
--     night and upserts a row per (app, source, date) into metric_snapshots.
--   • Cloudflare heartbeat worker (workers/heartbeat) accepts /heartbeat
--     POSTs from the Electron app and upserts (device_id, date) rows.
--   • Reviews come in via cron pulls from MS Partner Center and Google
--     Play Reviews APIs into the reviews table.
--
-- Read path:
--   • admin.snipotter.com reads with the service role key. The whole
--     schema is server-only — no public SELECTs, no user-facing surface,
--     so RLS only needs to lock down the anon role.

-- Multi-app catalogue. Slug is the stable identifier we use in code so a
-- typo'd display_name doesn't break wiring. Per-store identifiers live
-- on the row so the cron worker can compose the right API URLs.
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  display_name text not null,
  -- Store identifiers — null when the app isn't on that platform yet.
  ms_store_id text,
  play_package_name text,
  appstore_id text,
  github_owner text,
  github_repo text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Daily snapshot per source. A 30-day chart is just `select date, ...
-- where source='ms-store' and date >= now() - interval '30 days'`.
-- Idempotent: pulling twice in one day overwrites the same row. The
-- `meta` jsonb captures source-specific extras (per-version breakdown,
-- per-region splits) without polluting the column list.
create table if not exists public.metric_snapshots (
  app_id uuid not null references public.apps(id) on delete cascade,
  source text not null,                                         -- 'ms-store' | 'play' | 'github' | 'web' | 'cloudflare' | 'heartbeat'
  date date not null,
  installs_total bigint,                                        -- cumulative installs as of `date`
  installs_delta bigint,                                        -- new installs on this date
  active_users bigint,                                          -- daily active users (unique devices)
  rating_avg numeric(3,2),
  rating_count bigint,
  meta jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (app_id, source, date)
);

create index if not exists metric_snapshots_app_date_idx
  on public.metric_snapshots(app_id, date desc);

-- Unified review feed. external_id is whatever the source uses (MS Store
-- review GUID, Play review GUID, etc.) so re-pulls don't duplicate.
create table if not exists public.reviews (
  app_id uuid not null references public.apps(id) on delete cascade,
  source text not null,                                         -- 'ms-store' | 'play' | 'appstore'
  external_id text not null,
  author text,
  rating int check (rating between 1 and 5),
  body text,
  language text,
  created_at timestamptz not null,
  -- Reply state — admin app writes here when the operator hits "Reply".
  -- The corresponding cron worker then pushes the reply back to the
  -- source via that platform's reviews API.
  replied boolean not null default false,
  reply_body text,
  reply_at timestamptz,
  raw jsonb not null default '{}'::jsonb,                       -- full payload for replay/debug
  fetched_at timestamptz not null default now(),
  primary key (app_id, source, external_id)
);

create index if not exists reviews_app_created_idx
  on public.reviews(app_id, created_at desc);
create index if not exists reviews_unreplied_idx
  on public.reviews(app_id, replied, created_at desc) where replied = false;

-- Per-device daily heartbeat. We dedupe on (device_id, date) so a device
-- that opens 50 times in a day counts as one DAU but each launch can
-- still update last_seen_at and the version it's running. Aggregates:
--   • DAU  = count distinct device_id where date = today
--   • WAU  = count distinct device_id where date >= today - 6
--   • MAU  = count distinct device_id where date >= today - 29
--   • Active install count ≈ count distinct device_id where last seen
--                              within last 14 days (configurable)
create table if not exists public.heartbeats (
  device_id text not null,                                      -- anonymised UUID generated client-side
  date date not null,
  app_id uuid references public.apps(id) on delete cascade,
  platform text,                                                -- 'darwin-arm64' | 'darwin-x64' | 'win32-x64' | 'linux-x64'
  version text,
  language text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (device_id, date)
);

create index if not exists heartbeats_app_date_idx
  on public.heartbeats(app_id, date desc);
create index if not exists heartbeats_last_seen_idx
  on public.heartbeats(last_seen_at desc);

-- Server-only schema. Lock down anon + authenticated; the admin app uses
-- the service role key so RLS doesn't gate it. The heartbeat worker uses
-- the service role too (we deliberately don't expose insert to anon).
alter table public.apps enable row level security;
alter table public.metric_snapshots enable row level security;
alter table public.reviews enable row level security;
alter table public.heartbeats enable row level security;

-- No policies = service-role-only access. Explicit, no surprises.

-- Seed Snipotter Desktop as the first tracked app. The Microsoft Store ID
-- matches what's used in apps/landing/src/SmartDownloadButton.tsx and the
-- Microsoft Store badge in App.tsx.
insert into public.apps (slug, display_name, ms_store_id, github_owner, github_repo)
values ('snipotter-desktop', 'Snipotter Desktop', '9PPS95VQ5L6L', 'MehmetGulenc', 'snipotter')
on conflict (slug) do nothing;

-- Snipotter Android — placeholder, ms_store_id null until Play Console
-- publishes. Updating play_package_name once the listing is live is one
-- UPDATE statement.
insert into public.apps (slug, display_name, play_package_name, github_owner, github_repo, is_active)
values ('snipotter-android', 'Snipotter Android', 'com.snipotter.app', 'MehmetGulenc', 'snipotter', true)
on conflict (slug) do nothing;
