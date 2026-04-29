-- Snipotter — v2 schema with Workspaces + Pairing Codes
-- Replaces 0001_init.sql. Drops old tables (you had nothing real in them yet).
-- Run this entire file in Supabase SQL Editor.
-- Also: Authentication → Settings → enable "Allow anonymous sign-ins"

-- ==========================================================================
-- Reset (only safe if nothing important is in old tables)
-- ==========================================================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop table if exists public.clipboard_items cascade;
drop table if exists public.notes cascade;
drop table if exists public.profiles cascade;
drop function if exists public.touch_updated_at() cascade;

-- ==========================================================================
-- Extensions
-- ==========================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ==========================================================================
-- Helpers
-- ==========================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ==========================================================================
-- workspaces
-- ==========================================================================
create table if not exists public.workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'My Snipotter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_workspaces on public.workspaces;
create trigger touch_workspaces before update on public.workspaces
  for each row execute procedure public.touch_updated_at();

alter table public.workspaces enable row level security;

-- ==========================================================================
-- workspace_members  (M:N: a user can belong to multiple workspaces)
-- ==========================================================================
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  device_name text,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id);

alter table public.workspace_members enable row level security;

-- ==========================================================================
-- pair_codes (short-lived, single-use)
-- ==========================================================================
create table if not exists public.pair_codes (
  code text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_user_id uuid references auth.users(id)
);

create index if not exists pair_codes_workspace_idx on public.pair_codes(workspace_id);

alter table public.pair_codes enable row level security;

-- ==========================================================================
-- clipboard_items (workspace-scoped)
-- ==========================================================================
create table if not exists public.clipboard_items (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
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

create index if not exists clipboard_items_ws_idx
  on public.clipboard_items(workspace_id, created_at desc);
create index if not exists clipboard_items_hash_idx
  on public.clipboard_items(workspace_id, hash);
create index if not exists clipboard_items_pinned_idx
  on public.clipboard_items(workspace_id, pinned) where pinned = true;
create index if not exists clipboard_items_text_trgm_idx
  on public.clipboard_items using gin (to_tsvector('simple', text));

drop trigger if exists touch_clipboard_items on public.clipboard_items;
create trigger touch_clipboard_items before update on public.clipboard_items
  for each row execute procedure public.touch_updated_at();

alter table public.clipboard_items enable row level security;

-- ==========================================================================
-- notes (workspace-scoped)
-- ==========================================================================
create table if not exists public.notes (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text,
  content text not null default '',
  pinned boolean not null default false,
  from_clipboard_id uuid references public.clipboard_items(id) on delete set null,
  ai jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_ws_idx
  on public.notes(workspace_id, updated_at desc);
create index if not exists notes_text_trgm_idx
  on public.notes using gin (to_tsvector('simple', coalesce(title,'') || ' ' || content));

drop trigger if exists touch_notes on public.notes;
create trigger touch_notes before update on public.notes
  for each row execute procedure public.touch_updated_at();

alter table public.notes enable row level security;

-- ==========================================================================
-- RLS helper: is_workspace_member(ws_id)
-- ==========================================================================
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws_id and wm.user_id = auth.uid()
  );
$$;

-- ==========================================================================
-- RLS Policies
-- ==========================================================================

-- workspaces: members can read/update their workspace
drop policy if exists "ws read" on public.workspaces;
create policy "ws read" on public.workspaces for select
  using (public.is_workspace_member(id));

drop policy if exists "ws update" on public.workspaces;
create policy "ws update" on public.workspaces for update
  using (public.is_workspace_member(id));

-- workspace_members: a user can read members of their workspaces, and remove themselves
drop policy if exists "wm read" on public.workspace_members;
create policy "wm read" on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "wm self delete" on public.workspace_members;
create policy "wm self delete" on public.workspace_members for delete
  using (user_id = auth.uid());

-- pair_codes: only members of the workspace can see their codes (no public read)
drop policy if exists "pc read by member" on public.pair_codes;
create policy "pc read by member" on public.pair_codes for select
  using (public.is_workspace_member(workspace_id));

-- clipboard_items: members of the workspace
drop policy if exists "clip read" on public.clipboard_items;
create policy "clip read" on public.clipboard_items for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "clip insert" on public.clipboard_items;
create policy "clip insert" on public.clipboard_items for insert
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "clip update" on public.clipboard_items;
create policy "clip update" on public.clipboard_items for update
  using (public.is_workspace_member(workspace_id));

drop policy if exists "clip delete" on public.clipboard_items;
create policy "clip delete" on public.clipboard_items for delete
  using (public.is_workspace_member(workspace_id));

-- notes: members of the workspace
drop policy if exists "notes read" on public.notes;
create policy "notes read" on public.notes for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "notes insert" on public.notes;
create policy "notes insert" on public.notes for insert
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "notes update" on public.notes;
create policy "notes update" on public.notes for update
  using (public.is_workspace_member(workspace_id));

drop policy if exists "notes delete" on public.notes;
create policy "notes delete" on public.notes for delete
  using (public.is_workspace_member(workspace_id));

-- ==========================================================================
-- RPC: ensure_workspace — idempotent
-- ==========================================================================
create or replace function public.ensure_workspace(p_device_name text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = auth.uid()
  order by wm.joined_at asc
  limit 1;

  if v_workspace_id is not null then
    if p_device_name is not null then
      update public.workspace_members
      set device_name = p_device_name
      where workspace_id = v_workspace_id and user_id = auth.uid();
    end if;
    return v_workspace_id;
  end if;

  insert into public.workspaces (name) values ('My Snipotter')
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role, device_name)
  values (v_workspace_id, auth.uid(), 'owner', p_device_name);

  return v_workspace_id;
end;
$$;

-- ==========================================================================
-- RPC: create_pair_code — returns a new code for current user's workspace
-- ==========================================================================
create or replace function public.create_pair_code()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_code text;
  v_charset text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = auth.uid()
  order by wm.joined_at asc
  limit 1;

  if v_workspace_id is null then
    raise exception 'No workspace found';
  end if;

  v_code := '';
  for i in 1..6 loop
    v_code := v_code || substr(v_charset, 1 + floor(random() * 32)::int, 1);
  end loop;
  v_code := substr(v_code, 1, 3) || '-' || substr(v_code, 4, 3);

  insert into public.pair_codes (code, workspace_id, created_by, expires_at)
  values (v_code, v_workspace_id, auth.uid(), now() + interval '10 minutes');

  return v_code;
end;
$$;

-- ==========================================================================
-- RPC: redeem_pair_code — joins caller into the workspace tied to the code
-- ==========================================================================
create or replace function public.redeem_pair_code(p_code text, p_device_name text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_clean_code text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_clean_code := upper(replace(trim(p_code), ' ', ''));
  if length(v_clean_code) = 6 then
    v_clean_code := substr(v_clean_code,1,3) || '-' || substr(v_clean_code,4,3);
  end if;

  select workspace_id into v_workspace_id
  from public.pair_codes
  where code = v_clean_code
    and expires_at > now()
    and used_at is null;

  if v_workspace_id is null then
    raise exception 'Invalid or expired pair code';
  end if;

  update public.pair_codes
  set used_at = now(), used_by_user_id = auth.uid()
  where code = v_clean_code;

  insert into public.workspace_members (workspace_id, user_id, role, device_name)
  values (v_workspace_id, auth.uid(), 'member', p_device_name)
  on conflict (workspace_id, user_id) do update
    set device_name = coalesce(excluded.device_name, public.workspace_members.device_name);

  return v_workspace_id;
end;
$$;

grant execute on function public.ensure_workspace(text) to authenticated, anon;
grant execute on function public.create_pair_code() to authenticated, anon;
grant execute on function public.redeem_pair_code(text, text) to authenticated, anon;

-- ==========================================================================
-- Realtime publication
-- ==========================================================================
do $$ begin
  alter publication supabase_realtime add table public.clipboard_items;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.workspace_members;
exception when duplicate_object then null; end $$;
