-- Notebooks; rolled back. See run-local.sh.
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000c');
insert into public.workspaces (id) values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c');
insert into public.notes (id, workspace_id, content) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'x');

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('request.jwt.claim.sub', uid, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;
create function pg_temp.rejects(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL: % (accepted)', label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'ok: %', label;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.notebooks (id, workspace_id, name) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'İş'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Toplantılar');
update public.notebooks set parent_id = '30000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000002';
select pg_temp.expect((select parent_id from public.notebooks where id = '30000000-0000-0000-0000-000000000002') = '30000000-0000-0000-0000-000000000001', 'nested notebook');
select pg_temp.rejects($$update public.notebooks set parent_id = '30000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000001'$$, 'cycle rejected');
select pg_temp.rejects($$insert into public.notebooks (workspace_id, name) values ('10000000-0000-0000-0000-000000000001', '   ')$$, 'blank name rejected');
update public.notes set notebook_id = '30000000-0000-0000-0000-000000000002' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.expect((select notebook_id from public.notes where id = '20000000-0000-0000-0000-000000000001') is not null, 'note filed');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.notebooks) = 0, 'outsider sees no notebooks');
select pg_temp.rejects($$insert into public.notebooks (workspace_id, name) values ('10000000-0000-0000-0000-000000000001', 'sızma')$$, 'outsider insert rejected');
insert into public.notebooks (id, workspace_id, name) values ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'Benim');
select pg_temp.rejects($$insert into public.notebooks (workspace_id, name, parent_id) values ('10000000-0000-0000-0000-000000000002', 'x', '30000000-0000-0000-0000-000000000001')$$, 'foreign parent rejected');
reset role;

select pg_temp.rejects($$update public.notes set notebook_id = '30000000-0000-0000-0000-000000000009' where id = '20000000-0000-0000-0000-000000000001'$$, 'note cannot move into another workspace notebook');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.trash_notes(array['20000000-0000-0000-0000-000000000001']::uuid[]);
delete from public.notebooks where id = '30000000-0000-0000-0000-000000000002';
select pg_temp.expect(public.restore_notes(array['20000000-0000-0000-0000-000000000001']::uuid[]) = 1, 'note restores after its notebook was deleted');
select pg_temp.expect((select notebook_id from public.notes where id = '20000000-0000-0000-0000-000000000001') is null, 'restored note lands outside notebooks');
insert into public.notebooks (id, workspace_id, name) values ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Toplantılar');
update public.notebooks set parent_id = '30000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000002';
update public.notes set notebook_id = '30000000-0000-0000-0000-000000000002' where id = '20000000-0000-0000-0000-000000000001';
delete from public.notebooks where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.expect((select count(*) from public.notebooks) = 0, 'deleting a notebook removes its children');
select pg_temp.expect((select notebook_id from public.notes where id = '20000000-0000-0000-0000-000000000001') is null, 'notes survive notebook deletion');
reset role;

rollback;
