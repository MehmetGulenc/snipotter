-- Shared spaces; rolled back. See run-local.sh.
-- People: P1 (devices A, A2), P2 (device B), P3 (device C, never invited).
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
insert into public.workspaces (id, encryption) values
  ('10000000-0000-0000-0000-000000000001', 'v1'),
  ('10000000-0000-0000-0000-000000000002', 'v1'),
  ('10000000-0000-0000-0000-000000000003', 'v1'),
  ('10000000-0000-0000-0000-000000000004', null);
insert into public.workspace_members (workspace_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000c'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000c');
insert into public.notes (id, workspace_id, content) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'enc:v1:UDFvd24=');

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

-- P1 creates the space from device A.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.rejects($$select public.create_space('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  'Ev', repeat('a', 64), 'enc:v1:S0VZ', null)$$, 'plaintext space name refused');
select pg_temp.rejects($$select public.create_space('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
  'enc:v1:RXY=', repeat('a', 64), 'enc:v1:S0VZ', null)$$, 'cannot create a space as someone else');
select public.create_space('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  'enc:v1:RXY=', repeat('a', 64), 'enc:v1:S0VZ', 'enc:v1:QWhtZXQ=');
select pg_temp.expect((select kind = 'shared' and encryption = 'v1' from public.workspaces where id = '30000000-0000-0000-0000-000000000001'), 'space is shared and encrypted');
select pg_temp.expect((select role from public.space_members where space_id = '30000000-0000-0000-0000-000000000001') = 'owner', 'creator is owner');
select pg_temp.rejects($$update public.workspaces set encryption = null where id = '10000000-0000-0000-0000-000000000001'$$, 'encryption cannot be switched off');
select pg_temp.rejects($$update public.workspaces set name = 'açık ad' where id = '30000000-0000-0000-0000-000000000001'$$, 'no direct workspace updates');

-- Notes in the space; the second device of P1 sees them without any extra step.
insert into public.notes (id, workspace_id, content) values ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'enc:v1:T3J0YWs=');
select pg_temp.expect(true, 'member writes a note (push trigger never blocks)');
select pg_temp.rejects($$insert into public.notes (workspace_id, content) values ('30000000-0000-0000-0000-000000000001', 'düz metin')$$, 'plaintext refused in the space');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from public.notes where workspace_id = '30000000-0000-0000-0000-000000000001') = 1, 'other device of the same person sees the space');

-- Invite P2.
select public.create_space_invite('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', repeat('1', 64), repeat('W', 60));
select pg_temp.rejects($$select count(*) from public.space_invites$$, 'invites are not readable directly');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.notes where workspace_id = '30000000-0000-0000-0000-000000000001') = 0, 'outsider sees nothing before joining');
select pg_temp.expect((select wrapped from public.peek_space_invite(repeat('1', 64))) = repeat('W', 60), 'invite can be read with its secret id');
select pg_temp.rejects($$select public.join_space(repeat('1', 64), '10000000-0000-0000-0000-000000000001', 'enc:v1:S0VZ', null)$$, 'cannot join as someone else');
select pg_temp.expect(public.join_space(repeat('1', 64), '10000000-0000-0000-0000-000000000002', 'enc:v1:S0VZMg==', 'enc:v1:QXnFn2U=') = '30000000-0000-0000-0000-000000000001', 'P2 joins');
select pg_temp.expect((select count(*) from public.notes where workspace_id = '30000000-0000-0000-0000-000000000001') = 1, 'P2 reads space notes');
select pg_temp.expect((select count(*) from public.notes where workspace_id = '10000000-0000-0000-0000-000000000001') = 0, 'P2 cannot read P1 personal notes');
select pg_temp.expect((select count(*) from public.space_members) = 2, 'P2 sees both members');
select pg_temp.rejects($$select public.join_space(repeat('1', 64), '10000000-0000-0000-0000-000000000002', 'enc:v1:S0VZ', null)$$, 'invite is single use');
select pg_temp.rejects($$select public.offer_key_transfer('30000000-0000-0000-0000-000000000001', repeat('2', 64), repeat('K', 60))$$, 'device pairing into a space refused');
select pg_temp.rejects($$select public.remove_space_member('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001')$$, 'member cannot remove the owner');
select public.rename_space('30000000-0000-0000-0000-000000000001', 'enc:v1:RXYy');
select pg_temp.expect(true, 'member renames the space');

-- P3 and an unencrypted personal workspace stay out.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.space_members) = 0, 'outsider sees no members');
select pg_temp.rejects($$select public.rename_space('30000000-0000-0000-0000-000000000001', 'enc:v1:SGFjaw==')$$, 'outsider cannot rename');
select pg_temp.rejects($$select public.create_space('10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000009',
  'enc:v1:RXY=', repeat('a', 64), 'enc:v1:S0VZ', null)$$, 'unencrypted personal workspace cannot create spaces');
select pg_temp.rejects($$select * from public.peek_space_invite(repeat('9', 64))$$, 'unknown invite refused');

-- Owner removes P2: access ends at once.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.remove_space_member('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.notes where workspace_id = '30000000-0000-0000-0000-000000000001') = 0, 'removed member loses access');

-- Owner leaves alone: the space and its notes are deleted.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.remove_space_member('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.expect(not exists (select 1 from public.workspaces where id = '30000000-0000-0000-0000-000000000001'), 'last member out deletes the space');
select pg_temp.expect(not exists (select 1 from public.notes where id = '20000000-0000-0000-0000-000000000002'), 'space notes go with it');
select pg_temp.expect(exists (select 1 from public.notes where id = '20000000-0000-0000-0000-000000000001'), 'personal notes untouched');

-- Ownership passes on when the owner leaves others behind.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.create_space('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'enc:v1:RXY=', repeat('b', 64), 'enc:v1:S0VZ', null);
select public.create_space_invite('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', repeat('3', 64), repeat('W', 60));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.join_space(repeat('3', 64), '10000000-0000-0000-0000-000000000002', 'enc:v1:S0VZ', null);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.remove_space_member('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.expect((select role from public.space_members where space_id = '30000000-0000-0000-0000-000000000002') = 'owner', 'remaining member becomes owner');

rollback;
