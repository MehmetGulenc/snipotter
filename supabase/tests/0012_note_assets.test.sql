-- Storage RLS for note images; rolled back. See run-local.sh.
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000c');
insert into public.workspaces (id) values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c');

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

select pg_temp.expect((select not public from storage.buckets where id = 'note-assets'), 'bucket is private');
select pg_temp.expect(public.asset_workspace('nonsense/x.png') is null, 'malformed path maps to no workspace');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into storage.objects (bucket_id, name) values ('note-assets', '10000000-0000-0000-0000-000000000001/n1/a.jpg');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'note-assets') = 1, 'member uploads and reads own workspace image');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('note-assets', '10000000-0000-0000-0000-000000000002/n2/b.jpg');
  raise exception 'FAIL: upload into another workspace allowed';
exception when insufficient_privilege then raise notice 'ok: upload into another workspace rejected'; end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('note-assets', 'serbest/c.jpg');
  raise exception 'FAIL: upload outside a workspace folder allowed';
exception when insufficient_privilege then raise notice 'ok: upload outside a workspace folder rejected'; end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'note-assets') = 0, 'outsider cannot see the image');
delete from storage.objects where bucket_id = 'note-assets';
reset role;
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'note-assets') = 1, 'outsider cannot delete the image');

rollback;
