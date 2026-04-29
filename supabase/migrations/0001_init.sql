-- Snipotter — Initial schema
-- Run this in your Supabase SQL editor (or via supabase CLI: supabase db push)
-- The schema is designed for realtime sync: every table has updated_at,
-- soft pin flag, and RLS policies tied to auth.uid().

-- ==========================================================================
-- Extensions
-- ==========================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ==========================================================================
-- profiles
-- ==========================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "Profiles are updatable by owner" on public.profiles;
create policy "Profiles are updatable by owner"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "Profiles are insertable by owner" on public.profiles;
create policy "Profiles are insertable by owner"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile when a new auth.user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==========================================================================
-- clipboard_items
-- ==========================================================================
create table if not exists public.clipboard_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('text','image','file','rich-text')),
  text text not null,
  hash text not null,
  html text,
  source_app text,
  pinned boolean not null default false,
  ai jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clipboard_items_user_idx
  on public.clipboard_items(user_id, created_at desc);
create index if not exists clipboard_items_hash_idx
  on public.clipboard_items(user_id, hash);
create index if not exists clipboard_items_pinned_idx
  on public.clipboard_items(user_id, pinned) where pinned = true;
-- For full text search across clipboard
create index if not exists clipboard_items_text_trgm_idx
  on public.clipboard_items using gin (to_tsvector('simple', text));

alter table public.clipboard_items enable row level security;

drop policy if exists "Clipboards are viewable by owner" on public.clipboard_items;
create policy "Clipboards are viewable by owner"
  on public.clipboard_items for select using (auth.uid() = user_id);

drop policy if exists "Clipboards are insertable by owner" on public.clipboard_items;
create policy "Clipboards are insertable by owner"
  on public.clipboard_items for insert with check (auth.uid() = user_id);

drop policy if exists "Clipboards are updatable by owner" on public.clipboard_items;
create policy "Clipboards are updatable by owner"
  on public.clipboard_items for update using (auth.uid() = user_id);

drop policy if exists "Clipboards are deletable by owner" on public.clipboard_items;
create policy "Clipboards are deletable by owner"
  on public.clipboard_items for delete using (auth.uid() = user_id);

-- ==========================================================================
-- notes
-- ==========================================================================
create table if not exists public.notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  content text not null default '',
  pinned boolean not null default false,
  from_clipboard_id uuid references public.clipboard_items(id) on delete set null,
  ai jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_idx
  on public.notes(user_id, updated_at desc);
create index if not exists notes_text_trgm_idx
  on public.notes using gin (to_tsvector('simple', coalesce(title,'') || ' ' || content));

alter table public.notes enable row level security;

drop policy if exists "Notes are viewable by owner" on public.notes;
create policy "Notes are viewable by owner"
  on public.notes for select using (auth.uid() = user_id);

drop policy if exists "Notes are insertable by owner" on public.notes;
create policy "Notes are insertable by owner"
  on public.notes for insert with check (auth.uid() = user_id);

drop policy if exists "Notes are updatable by owner" on public.notes;
create policy "Notes are updatable by owner"
  on public.notes for update using (auth.uid() = user_id);

drop policy if exists "Notes are deletable by owner" on public.notes;
create policy "Notes are deletable by owner"
  on public.notes for delete using (auth.uid() = user_id);

-- ==========================================================================
-- updated_at trigger
-- ==========================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_clipboard_items on public.clipboard_items;
create trigger touch_clipboard_items
  before update on public.clipboard_items
  for each row execute procedure public.touch_updated_at();

drop trigger if exists touch_notes on public.notes;
create trigger touch_notes
  before update on public.notes
  for each row execute procedure public.touch_updated_at();

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();

-- ==========================================================================
-- Realtime publication (Supabase enables 'supabase_realtime' by default)
-- ==========================================================================
do $$ begin
  alter publication supabase_realtime add table public.clipboard_items;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null;
end $$;
