-- Notes v2, phase 1: Yjs (CRDT) sync, version history, trash.
-- Legacy clients (desktop <= 0.8.x, iOS build <= 4) keep reading/writing notes.content;
-- new clients mirror the Yjs document into notes.content and stamp ydoc_content_sha so
-- a legacy edit (content changed, sha not) can be detected and re-seeded.
begin;

alter table public.notes
  add column if not exists ydoc text,
  add column if not exists ydoc_seq bigint not null default 0,
  add column if not exists ydoc_content_sha text;

-- ── Incremental Yjs updates ──────────────────────────────────────────────────
create table public.note_updates (
  id bigserial primary key,
  note_id uuid not null references public.notes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  "update" text not null check (char_length("update") between 1 and 1000000),
  created_at timestamptz not null default now()
);
create index note_updates_note_id on public.note_updates(note_id, id);
alter table public.note_updates enable row level security;
create policy note_updates_read on public.note_updates for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy note_updates_insert on public.note_updates for insert to authenticated
  with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));
revoke all on public.note_updates from anon, authenticated;
grant select, insert on public.note_updates to authenticated;
grant usage on sequence public.note_updates_id_seq to authenticated;

create function public.guard_note_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.notes where id = new.note_id and workspace_id = new.workspace_id) then
    raise exception 'Note workspace mismatch';
  end if;
  new.created_at := now();
  return new;
end $$;
create trigger guard_note_update before insert on public.note_updates
for each row execute function public.guard_note_update();

alter table public.note_updates replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.note_updates;
exception when duplicate_object then null; end $$;

-- Snapshot + prune in one step. Only moves forward (a stale client cannot roll back).
create function public.compact_note(p_note_id uuid, p_ydoc text, p_seq bigint, p_content text, p_content_sha text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select workspace_id into ws from public.notes where id = p_note_id;
  if ws is null or not public.is_workspace_member(ws) then raise exception 'Not allowed'; end if;
  if char_length(p_ydoc) > 5000000 then raise exception 'Snapshot too large'; end if;
  update public.notes
     set ydoc = p_ydoc, ydoc_seq = p_seq, content = p_content, ydoc_content_sha = p_content_sha
   where id = p_note_id and ydoc_seq < p_seq;
  if not found then return false; end if;
  delete from public.note_updates where note_id = p_note_id and id <= p_seq;
  return true;
end $$;
revoke all on function public.compact_note(uuid, text, bigint, text, text) from public, anon;
grant execute on function public.compact_note(uuid, text, bigint, text, text) to authenticated;

-- ── Version history ──────────────────────────────────────────────────────────
create table public.note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  kind text not null default 'auto' check (kind in ('auto', 'manual', 'restore')),
  title text,
  content text not null check (char_length(content) <= 5000000),
  created_at timestamptz not null default now()
);
create index note_versions_note on public.note_versions(note_id, created_at desc);
alter table public.note_versions enable row level security;
create policy note_versions_read on public.note_versions for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy note_versions_insert on public.note_versions for insert to authenticated
  with check (public.is_workspace_member(workspace_id)
    and exists (select 1 from public.notes n where n.id = note_id and n.workspace_id = note_versions.workspace_id));
revoke all on public.note_versions from anon, authenticated;
grant select, insert on public.note_versions to authenticated;

-- Keep the newest 50 automatic versions per note.
create function public.prune_note_versions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.note_versions v
   where v.note_id = new.note_id and v.kind = 'auto'
     and v.id not in (select id from public.note_versions
                       where note_id = new.note_id and kind = 'auto'
                       order by created_at desc limit 50);
  return null;
end $$;
create trigger prune_note_versions after insert on public.note_versions
for each row execute function public.prune_note_versions();

-- ── Trash ────────────────────────────────────────────────────────────────────
-- A trashed note leaves public.notes, so legacy clients see an ordinary delete.
create table public.notes_trash (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  note jsonb not null,
  updates jsonb not null default '[]'::jsonb,
  deleted_by uuid default auth.uid() references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now()
);
create index notes_trash_ws on public.notes_trash(workspace_id, deleted_at desc);
alter table public.notes_trash enable row level security;
create policy notes_trash_read on public.notes_trash for select to authenticated
  using (public.is_workspace_member(workspace_id));
revoke all on public.notes_trash from anon, authenticated;
grant select on public.notes_trash to authenticated;

create function public.trash_notes(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; r public.notes;
begin
  for r in select * from public.notes where id = any(p_ids) for update loop
    if not public.is_workspace_member(r.workspace_id) then raise exception 'Not allowed'; end if;
    insert into public.notes_trash (id, workspace_id, note, updates)
    values (r.id, r.workspace_id, to_jsonb(r),
      coalesce((select jsonb_agg(jsonb_build_object('update', u."update", 'created_by', u.created_by) order by u.id)
                from public.note_updates u where u.note_id = r.id), '[]'::jsonb))
    on conflict (id) do update set note = excluded.note, updates = excluded.updates, deleted_at = now();
    delete from public.notes where id = r.id;
    n := n + 1;
  end loop;
  -- 30-day retention, piggybacking on trash activity instead of a scheduler.
  delete from public.note_versions v using public.notes_trash t
   where v.note_id = t.id and t.deleted_at < now() - interval '30 days' and public.is_workspace_member(t.workspace_id);
  delete from public.notes_trash t
   where t.deleted_at < now() - interval '30 days' and public.is_workspace_member(t.workspace_id);
  return n;
end $$;

create function public.restore_notes(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; t public.notes_trash; restored public.notes;
begin
  for t in select * from public.notes_trash where id = any(p_ids) for update loop
    if not public.is_workspace_member(t.workspace_id) then raise exception 'Not allowed'; end if;
    restored := jsonb_populate_record(null::public.notes, t.note);
    restored.ydoc_seq := 0;
    insert into public.notes select restored.*;
    insert into public.note_updates (note_id, workspace_id, created_by, "update")
    select t.id, t.workspace_id, coalesce((e->>'created_by')::uuid, auth.uid()), e->>'update'
      from jsonb_array_elements(t.updates) e;
    -- Updates before the snapshot were folded into ydoc; ydoc_seq 0 makes the restored
    -- snapshot + re-inserted updates the full history again.
    delete from public.notes_trash where id = t.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.purge_trashed_notes(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if exists (select 1 from public.notes_trash where id = any(p_ids) and not public.is_workspace_member(workspace_id)) then
    raise exception 'Not allowed';
  end if;
  delete from public.note_versions where note_id = any(p_ids)
    and workspace_id in (select workspace_id from public.notes_trash where id = any(p_ids));
  delete from public.notes_trash where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.trash_notes(uuid[]) from public, anon;
revoke all on function public.restore_notes(uuid[]) from public, anon;
revoke all on function public.purge_trashed_notes(uuid[]) from public, anon;
grant execute on function public.trash_notes(uuid[]) to authenticated;
grant execute on function public.restore_notes(uuid[]) to authenticated;
grant execute on function public.purge_trashed_notes(uuid[]) to authenticated;

commit;
