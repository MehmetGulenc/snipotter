-- Notes v2, phase 2: notebooks (nested folders). Tags and note links live inside
-- note content, so older app versions keep them intact without schema changes.
begin;

create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.notebooks(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  icon text check (char_length(icon) <= 16),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create index notebooks_ws on public.notebooks(workspace_id, sort);
alter table public.notebooks enable row level security;
create policy notebooks_read on public.notebooks for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy notebooks_insert on public.notebooks for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy notebooks_update on public.notebooks for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy notebooks_delete on public.notebooks for delete to authenticated
  using (public.is_workspace_member(workspace_id));
revoke all on public.notebooks from anon, authenticated;
grant select, insert, update, delete on public.notebooks to authenticated;
create trigger touch_notebooks before update on public.notebooks
for each row execute function public.touch_updated_at();

-- Parent must be in the same workspace and must not create a cycle; at most 4 levels.
create function public.guard_notebook() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur uuid := new.parent_id; depth int := 1;
begin
  while cur is not null loop
    if cur = new.id then raise exception 'Notebook cycle'; end if;
    depth := depth + 1;
    if depth > 4 then raise exception 'Notebooks nest at most 4 levels'; end if;
    select parent_id into cur from public.notebooks where id = cur and workspace_id = new.workspace_id;
    if not found then raise exception 'Parent notebook not in this workspace'; end if;
  end loop;
  return new;
end $$;
create trigger guard_notebook before insert or update of parent_id on public.notebooks
for each row execute function public.guard_notebook();

do $$ begin
  alter publication supabase_realtime add table public.notebooks;
exception when duplicate_object then null; end $$;

alter table public.notes add column if not exists notebook_id uuid references public.notebooks(id) on delete set null;
create index if not exists notes_notebook on public.notes(notebook_id);

-- A note may only be filed in a notebook of its own workspace. A notebook that no
-- longer exists (note restored from the trash after its notebook was deleted) is dropped.
create function public.guard_note_notebook() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if new.notebook_id is null then return new; end if;
  select workspace_id into ws from public.notebooks where id = new.notebook_id;
  if not found then
    new.notebook_id := null;
  elsif ws <> new.workspace_id then
    raise exception 'Notebook not in this workspace';
  end if;
  return new;
end $$;
create trigger guard_note_notebook before insert or update of notebook_id on public.notes
for each row execute function public.guard_note_notebook();

commit;
