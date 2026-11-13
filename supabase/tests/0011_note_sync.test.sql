-- Run against a disposable database with all migrations applied:
--   docker exec -i <container> psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/0011_note_sync.test.sql
-- Everything runs in one transaction and is rolled back.
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');
insert into public.workspaces (id) values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c');
insert into public.notes (id, workspace_id, content) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'eski içerik'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'başkasının notu');

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  -- Bare postgres images ship the older auth.uid() that reads only this setting.
  select set_config('request.jwt.claim.sub', uid, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- Member A writes updates; member B reads them.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.note_updates (note_id, workspace_id, "update") values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'AAE='),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'AAI=');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.note_updates) = 2, 'member reads workspace updates');
reset role;

-- Outsider C: sees nothing, cannot write, cannot compact or trash.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.note_updates) = 0, 'outsider reads no updates');
do $$ begin
  insert into public.note_updates (note_id, workspace_id, "update")
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'AAE=');
  raise exception 'FAIL: outsider insert allowed';
exception when insufficient_privilege then raise notice 'ok: outsider insert rejected'; end $$;
do $$ begin
  -- Own workspace id but another workspace's note: the guard trigger must reject it.
  insert into public.note_updates (note_id, workspace_id, "update")
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'AAE=');
  raise exception 'FAIL: cross-workspace insert allowed';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: cross-workspace note rejected';
end $$;
do $$ begin
  perform public.compact_note('20000000-0000-0000-0000-000000000001', 'AAA=', 999, '{}', 'x');
  raise exception 'FAIL: outsider compact allowed';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: outsider compact rejected';
end $$;
do $$ begin
  perform public.trash_notes(array['20000000-0000-0000-0000-000000000001']::uuid[]);
  raise exception 'FAIL: outsider trash allowed';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: outsider trash rejected';
end $$;
do $$ begin
  delete from public.note_updates;
  raise exception 'FAIL: direct delete allowed';
exception when insufficient_privilege then raise notice 'ok: direct delete of updates not granted'; end $$;
reset role;

-- Compaction moves forward only and prunes covered updates.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(public.compact_note('20000000-0000-0000-0000-000000000001', 'U05BUA==',
  (select max(id) from public.note_updates), '{"type":"doc"}', 'sha1'), 'compact accepted');
select pg_temp.expect((select count(*) from public.note_updates) = 0, 'covered updates pruned');
select pg_temp.expect(not public.compact_note('20000000-0000-0000-0000-000000000001', 'ESKI', 1, 'x', 'x'), 'stale compact refused');
select pg_temp.expect((select ydoc from public.notes where id = '20000000-0000-0000-0000-000000000001') = 'U05BUA==', 'snapshot kept');
insert into public.note_updates (note_id, workspace_id, "update")
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'U09OUkE=');

-- Versions: only the newest 50 automatic ones survive; manual ones are kept.
insert into public.note_versions (note_id, workspace_id, kind, content)
select '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'auto', 'v' || g
  from generate_series(1, 55) g;
insert into public.note_versions (note_id, workspace_id, kind, content)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'manual', 'elle');
select pg_temp.expect((select count(*) from public.note_versions where kind = 'auto') = 50, 'auto versions capped at 50');
select pg_temp.expect((select count(*) from public.note_versions where kind = 'manual') = 1, 'manual version kept');

-- Trash → restore keeps snapshot + later updates; purge removes everything.
select pg_temp.expect(public.trash_notes(array['20000000-0000-0000-0000-000000000001']::uuid[]) = 1, 'note trashed');
select pg_temp.expect(not exists (select 1 from public.notes where id = '20000000-0000-0000-0000-000000000001'), 'trashed note left notes');
select pg_temp.expect((select jsonb_array_length(updates) from public.notes_trash) = 1, 'pending update kept in trash');
select pg_temp.expect(public.restore_notes(array['20000000-0000-0000-0000-000000000001']::uuid[]) = 1, 'note restored');
select pg_temp.expect((select ydoc from public.notes where id = '20000000-0000-0000-0000-000000000001') = 'U05BUA==', 'restored snapshot');
select pg_temp.expect((select count(*) from public.note_updates where note_id = '20000000-0000-0000-0000-000000000001') = 1, 'restored updates');
select pg_temp.expect((select ydoc_seq from public.notes where id = '20000000-0000-0000-0000-000000000001') = 0, 'restored seq reset');
select public.trash_notes(array['20000000-0000-0000-0000-000000000001']::uuid[]);
select pg_temp.expect(public.purge_trashed_notes(array['20000000-0000-0000-0000-000000000001']::uuid[]) = 1, 'purged');
select pg_temp.expect(not exists (select 1 from public.note_versions where note_id = '20000000-0000-0000-0000-000000000001'), 'versions purged');
reset role;

-- Outsider cannot read another workspace's trash or versions.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.notes_trash) = 0 and (select count(*) from public.note_versions) = 0, 'outsider sees no trash/versions');
reset role;

rollback;
