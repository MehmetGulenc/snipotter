-- End-to-end encryption (docs/sifreleme-tasarimi.md). The server only ever stores
-- ciphertext, keys wrapped with secrets it never sees, and ids derived from them.
begin;

alter table public.workspaces
  add column if not exists encryption text check (encryption in ('v1'));

-- One key per workspace. wrapped_recovery opens only with the 24 recovery words;
-- recovery_id is derived from those words and lets a fresh device find (and join) it.
create table public.workspace_keys (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  key_check text not null check (key_check ~ '^[0-9a-f]{64}$'),
  wrapped_recovery text not null check (char_length(wrapped_recovery) between 40 and 200),
  recovery_id text not null unique check (recovery_id ~ '^[0-9a-f]{64}$'),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.workspace_keys enable row level security;
create policy workspace_keys_read on public.workspace_keys for select to authenticated
  using (public.is_workspace_member(workspace_id));
revoke all on public.workspace_keys from anon, authenticated;
grant select on public.workspace_keys to authenticated;

-- Short-lived hand-over of the key to a new device or an invited person (12 words / QR).
create table public.key_transfers (
  transfer_id text primary key check (transfer_id ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  wrapped text not null check (char_length(wrapped) between 40 and 200),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.key_transfers enable row level security;
revoke all on public.key_transfers from anon, authenticated;

-- Turns encryption on. Exactly one device wins; the others must pair with it.
create function public.enable_encryption(p_workspace_id uuid, p_key_check text, p_wrapped_recovery text, p_recovery_id text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Not allowed'; end if;
  insert into public.workspace_keys (workspace_id, key_check, wrapped_recovery, recovery_id)
  values (p_workspace_id, p_key_check, p_wrapped_recovery, p_recovery_id)
  on conflict (workspace_id) do nothing;
  if not found then return false; end if;
  update public.workspaces set encryption = 'v1' where id = p_workspace_id;
  return true;
end $$;

-- Offers the key for 10 minutes under an id derived from a one-time secret.
create function public.offer_key_transfer(p_workspace_id uuid, p_transfer_id text, p_wrapped text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Not allowed'; end if;
  delete from public.key_transfers where expires_at < now() or created_by = auth.uid();
  insert into public.key_transfers (transfer_id, workspace_id, wrapped) values (p_transfer_id, p_workspace_id, p_wrapped);
end $$;

-- The secret is the invitation: whoever holds it joins and receives the wrapped key, once.
create function public.redeem_key_transfer(p_transfer_id text, p_device_name text default null)
returns table (workspace_id uuid, wrapped text)
language plpgsql security definer set search_path = public as $$
declare t public.key_transfers;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from public.key_transfers k where k.transfer_id = p_transfer_id and k.expires_at > now() returning * into t;
  if t.transfer_id is null then raise exception 'Kod geçersiz ya da süresi dolmuş'; end if;
  insert into public.workspace_members (workspace_id, user_id, role, device_name)
  values (t.workspace_id, auth.uid(), 'member', p_device_name)
  on conflict on constraint workspace_members_pkey do update
    set device_name = coalesce(excluded.device_name, public.workspace_members.device_name);
  return query select t.workspace_id, t.wrapped;
end $$;

-- All devices lost: the 24 recovery words find the workspace and rejoin it.
create function public.recover_workspace(p_recovery_id text, p_device_name text default null)
returns table (workspace_id uuid, wrapped_recovery text)
language plpgsql security definer set search_path = public as $$
declare k public.workspace_keys;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into k from public.workspace_keys w where w.recovery_id = p_recovery_id;
  if k.workspace_id is null then raise exception 'Kurtarma kelimeleri hiçbir çalışma alanıyla eşleşmedi'; end if;
  insert into public.workspace_members (workspace_id, user_id, role, device_name)
  values (k.workspace_id, auth.uid(), 'member', p_device_name)
  on conflict on constraint workspace_members_pkey do update
    set device_name = coalesce(excluded.device_name, public.workspace_members.device_name);
  return query select k.workspace_id, k.wrapped_recovery;
end $$;

revoke all on function public.enable_encryption(uuid, text, text, text) from public, anon;
revoke all on function public.offer_key_transfer(uuid, text, text) from public, anon;
revoke all on function public.redeem_key_transfer(text, text) from public, anon;
revoke all on function public.recover_workspace(text, text) from public, anon;
grant execute on function public.enable_encryption(uuid, text, text, text) to authenticated;
grant execute on function public.offer_key_transfer(uuid, text, text) to authenticated;
grant execute on function public.redeem_key_transfer(text, text) to authenticated;
grant execute on function public.recover_workspace(text, text) to authenticated;

-- ── Plaintext is refused once a workspace is encrypted ───────────────────────
-- Older app versions write plaintext; their writes fail and they are asked to update.
create function public.require_ciphertext() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ws uuid := (to_jsonb(new) ->> 'workspace_id')::uuid;
  col text;
  val jsonb;
begin
  if not exists (select 1 from public.workspaces where id = ws and encryption = 'v1') then return new; end if;
  foreach col in array tg_argv loop
    val := to_jsonb(new) -> col;
    if val is null or val = 'null'::jsonb or val = '""'::jsonb then continue; end if;
    if jsonb_typeof(val) <> 'string' or left(val #>> '{}', 7) <> 'enc:v1:' then
      raise exception 'Encrypted workspace: % must be encrypted (update the app)', col using errcode = 'P0002';
    end if;
  end loop;
  return new;
end $$;

create trigger require_ciphertext before insert or update on public.clipboard_items
for each row execute function public.require_ciphertext('text', 'html', 'ai');
create trigger require_ciphertext before insert or update on public.notes
for each row execute function public.require_ciphertext('title', 'content', 'ai', 'ydoc');
create trigger require_ciphertext before insert or update on public.note_updates
for each row execute function public.require_ciphertext('update');
create trigger require_ciphertext before insert or update on public.note_versions
for each row execute function public.require_ciphertext('title', 'content');
create trigger require_ciphertext before insert or update on public.device_actions
for each row execute function public.require_ciphertext('payload', 'label');
create trigger require_ciphertext before insert or update on public.notebooks
for each row execute function public.require_ciphertext('name');

alter table public.notebooks drop constraint notebooks_name_check;
alter table public.notebooks add constraint notebooks_name_check check (char_length(btrim(name)) between 1 and 400);

-- ── Encrypting data written before the switch ────────────────────────────────
-- note_versions and notes_trash are append-only for clients; these narrow helpers
-- accept only ciphertext and only for the caller's own workspaces.
create function public.reseal_note_version(p_id uuid, p_title text, p_content text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if left(p_content, 7) <> 'enc:v1:' or (p_title is not null and left(p_title, 7) <> 'enc:v1:') then
    raise exception 'Ciphertext required';
  end if;
  update public.note_versions v set title = p_title, content = p_content
   where v.id = p_id and public.is_workspace_member(v.workspace_id);
end $$;

create function public.reseal_trashed_note(p_id uuid, p_title text, p_content text, p_ydoc text, p_updates jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (p_title is not null and left(p_title, 7) <> 'enc:v1:') or left(coalesce(nullif(p_content, ''), 'enc:v1:'), 7) <> 'enc:v1:'
     or (p_ydoc is not null and left(p_ydoc, 7) <> 'enc:v1:')
     or exists (select 1 from jsonb_array_elements(p_updates) e where left(e->>'update', 7) <> 'enc:v1:') then
    raise exception 'Ciphertext required';
  end if;
  update public.notes_trash t
     set note = t.note || jsonb_build_object('title', p_title, 'content', p_content, 'ydoc', p_ydoc, 'ai', null),
         updates = p_updates
   where t.id = p_id and public.is_workspace_member(t.workspace_id);
end $$;

-- "Send to phone" rows live 10 minutes but keep their payload; when a workspace
-- switches to encryption they are dropped (at most a pending, unopened one is lost).
create function public.purge_spent_device_actions(p_workspace_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Not allowed'; end if;
  delete from public.device_actions where workspace_id = p_workspace_id and left(payload, 7) <> 'enc:v1:';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.reseal_note_version(uuid, text, text) from public, anon;
revoke all on function public.reseal_trashed_note(uuid, text, text, text, jsonb) from public, anon;
revoke all on function public.purge_spent_device_actions(uuid) from public, anon;
grant execute on function public.reseal_note_version(uuid, text, text) to authenticated;
grant execute on function public.reseal_trashed_note(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.purge_spent_device_actions(uuid) to authenticated;

-- Ciphertext is longer than the text it hides.
alter table public.device_actions drop constraint device_actions_payload_check;
alter table public.device_actions add constraint device_actions_payload_check check (char_length(payload) between 1 and 4000);
alter table public.device_actions drop constraint device_actions_label_check;
alter table public.device_actions add constraint device_actions_label_check check (char_length(label) <= 400);

commit;
