-- End-to-end encryption server rules; rolled back. See run-local.sh.
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');
insert into public.workspaces (id) values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c');
insert into public.notes (id, workspace_id, content) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'eski düz not');

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
-- Before encryption, plaintext is fine (older apps keep working until it is switched on).
insert into public.clipboard_items (workspace_id, created_by, content_type, text, hash)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'text', 'düz', 'h1');
select pg_temp.expect(public.enable_encryption('10000000-0000-0000-0000-000000000001', repeat('a', 64), repeat('W', 60), repeat('1', 64)), 'encryption enabled');
select pg_temp.expect(not public.enable_encryption('10000000-0000-0000-0000-000000000001', repeat('b', 64), repeat('W', 60), repeat('2', 64)), 'second device cannot replace the key');
select pg_temp.expect((select key_check from public.workspace_keys) = repeat('a', 64), 'first key kept');

select pg_temp.rejects($$insert into public.clipboard_items (workspace_id, created_by, content_type, text, hash)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'text', 'düz metin', 'h2')$$, 'plaintext clip refused');
insert into public.clipboard_items (workspace_id, created_by, content_type, text, hash, ai)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'text', 'enc:v1:QUJD', 'h3', to_jsonb('enc:v1:REVG'::text));
select pg_temp.expect(true, 'ciphertext clip accepted');
select pg_temp.rejects($$update public.notes set content = 'yeni düz içerik' where id = '20000000-0000-0000-0000-000000000001'$$, 'plaintext note update refused');
select pg_temp.rejects($$update public.notes set ai = '{"summary":"açık"}' where id = '20000000-0000-0000-0000-000000000001'$$, 'plaintext ai json refused');
update public.notes set content = 'enc:v1:QUJD', title = null where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.expect(true, 'encrypted note update accepted');
update public.notes set content = '' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.expect(true, 'empty note allowed');
select pg_temp.rejects($$insert into public.note_updates (note_id, workspace_id, "update")
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'AAE=')$$, 'plaintext yjs update refused');
reset role;

-- Hand-over to a new device: the secret-derived id is the only way in, and it works once.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.offer_key_transfer('10000000-0000-0000-0000-000000000001', repeat('c', 64), repeat('K', 60));
select pg_temp.rejects($$select count(*) from public.key_transfers$$, 'transfers are not readable directly');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.rejects($$select * from public.redeem_key_transfer(repeat('d', 64))$$, 'wrong transfer id rejected');
select pg_temp.expect((select wrapped from public.redeem_key_transfer(repeat('c', 64), 'iPhone')) = repeat('K', 60), 'new device receives wrapped key');
select pg_temp.expect(public.is_workspace_member('10000000-0000-0000-0000-000000000001'), 'new device joined');
select pg_temp.rejects($$select * from public.redeem_key_transfer(repeat('c', 64))$$, 'transfer works only once');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.offer_key_transfer('10000000-0000-0000-0000-000000000001', repeat('e', 64), repeat('K', 60));
reset role;
update public.key_transfers set expires_at = now() - interval '1 second';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.rejects($$select * from public.redeem_key_transfer(repeat('e', 64))$$, 'expired transfer rejected');
reset role;

-- Outsiders: cannot offer, cannot see keys; recovery words let a fresh device back in.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.rejects($$select public.offer_key_transfer('10000000-0000-0000-0000-000000000001', repeat('f', 64), repeat('K', 60))$$, 'outsider cannot offer a transfer');
select pg_temp.rejects($$select public.enable_encryption('10000000-0000-0000-0000-000000000001', repeat('f', 64), repeat('W', 60), repeat('f', 64))$$, 'outsider cannot enable encryption');
select pg_temp.expect((select count(*) from public.workspace_keys) = 0, 'outsider sees no workspace keys');
select pg_temp.rejects($$select * from public.recover_workspace(repeat('9', 64))$$, 'wrong recovery id rejected');
select pg_temp.expect((select wrapped_recovery from public.recover_workspace(repeat('1', 64), 'Yeni Mac')) = repeat('W', 60), 'recovery returns wrapped key');
select pg_temp.expect(public.is_workspace_member('10000000-0000-0000-0000-000000000001'), 'recovered device joined');
reset role;

-- Ciphertext of an action payload fits.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.device_actions (workspace_id, sender_device, kind, payload)
values ('10000000-0000-0000-0000-000000000001', 'Mac', 'text', 'enc:v1:' || repeat('A', 3500));
select pg_temp.expect(true, 'long encrypted action payload accepted');
reset role;

rollback;
