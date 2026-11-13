-- Shared spaces (docs/ortak-alan-tasarimi.md): notes shared between people.
-- A person is their personal workspace (all of their paired devices). People join a
-- shared space; every device of a member gets access through the person.
-- The space key reaches each person sealed with that person's own key, so the
-- server still sees only ciphertext.
begin;

alter table public.workspaces
  add column if not exists kind text not null default 'personal' check (kind in ('personal', 'shared'));

-- Clients never update workspaces directly (names go through rename_space). Closes a
-- gap from 0014: a member could otherwise clear `encryption` and write plaintext.
drop policy if exists "ws update" on public.workspaces;
revoke insert, update, delete on public.workspaces from anon, authenticated;

-- Shared spaces have no recovery words: members recover through their own personal key.
alter table public.workspace_keys alter column wrapped_recovery drop not null;
alter table public.workspace_keys alter column recovery_id drop not null;

create table public.space_members (
  space_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  -- Both sealed client side: the name with the space key, the key with the person's key.
  display_name text check (display_name is null or left(display_name, 7) = 'enc:v1:' and char_length(display_name) <= 400),
  wrapped_key text not null check (left(wrapped_key, 7) = 'enc:v1:' and char_length(wrapped_key) <= 400),
  joined_at timestamptz not null default now(),
  primary key (space_id, person_id)
);
create index space_members_person_idx on public.space_members(person_id);

-- Device-level membership, unchanged from 0002.
create function public.is_direct_member(ws_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members wm where wm.workspace_id = ws_id and wm.user_id = auth.uid());
$$;

-- Every policy already goes through this helper: a shared space is open to the
-- devices of each member person. Personal workspaces stay device-only.
create or replace function public.is_workspace_member(ws_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_direct_member(ws_id)
      or exists (select 1 from public.space_members sm
                  where sm.space_id = ws_id and public.is_direct_member(sm.person_id));
$$;

alter table public.space_members enable row level security;
create policy space_members_read on public.space_members for select to authenticated
  using (public.is_workspace_member(space_id));
revoke all on public.space_members from anon, authenticated;
grant select on public.space_members to authenticated;

create table public.space_invites (
  invite_id text primary key check (invite_id ~ '^[0-9a-f]{64}$'),
  space_id uuid not null references public.workspaces(id) on delete cascade,
  wrapped text not null check (char_length(wrapped) between 40 and 200),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days'
);
alter table public.space_invites enable row level security;
revoke all on public.space_invites from anon, authenticated;

-- Caller's own personal workspace, encrypted (shared keys are sealed with it).
create function public.require_person(p_person uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_direct_member(p_person)
     or not exists (select 1 from public.workspaces w where w.id = p_person and w.kind = 'personal' and w.encryption = 'v1') then
    raise exception 'Not allowed';
  end if;
end $$;

create function public.create_space(p_person uuid, p_space uuid, p_name text, p_key_check text, p_wrapped_key text, p_display_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_person(p_person);
  if left(p_name, 7) <> 'enc:v1:' or char_length(p_name) > 400 then raise exception 'Ciphertext required'; end if;
  if (select count(*) from public.space_members where person_id = p_person) >= 20 then
    raise exception 'En fazla 20 ortak alana üye olabilirsin';
  end if;
  insert into public.workspaces (id, name, kind, encryption) values (p_space, p_name, 'shared', 'v1');
  insert into public.workspace_keys (workspace_id, key_check) values (p_space, p_key_check);
  insert into public.space_members (space_id, person_id, role, display_name, wrapped_key)
  values (p_space, p_person, 'owner', p_display_name, p_wrapped_key);
end $$;

create function public.rename_space(p_space uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if left(p_name, 7) <> 'enc:v1:' or char_length(p_name) > 400 then raise exception 'Ciphertext required'; end if;
  update public.workspaces set name = p_name
   where id = p_space and kind = 'shared' and public.is_workspace_member(id);
  if not found then raise exception 'Not allowed'; end if;
end $$;

create function public.set_space_display_name(p_space uuid, p_person uuid, p_display_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_person(p_person);
  update public.space_members set display_name = p_display_name where space_id = p_space and person_id = p_person;
end $$;

-- Any member may invite. The invite secret travels as a link or 12 words, never to the server.
create function public.create_space_invite(p_space uuid, p_person uuid, p_invite_id text, p_wrapped text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_person(p_person);
  if not exists (select 1 from public.space_members where space_id = p_space and person_id = p_person) then
    raise exception 'Not allowed';
  end if;
  delete from public.space_invites where expires_at < now();
  if (select count(*) from public.space_invites where space_id = p_space) >= 20 then
    raise exception 'Bu alan için çok fazla açık davet var';
  end if;
  insert into public.space_invites (invite_id, space_id, wrapped) values (p_invite_id, p_space, p_wrapped);
end $$;

-- Reading an invite proves nothing new (the id is derived from the secret) and lets the
-- client seal the key for its own person before joining in one step.
create function public.peek_space_invite(p_invite_id text)
returns table (space_id uuid, wrapped text, name text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return query select i.space_id, i.wrapped, w.name from public.space_invites i
    join public.workspaces w on w.id = i.space_id
   where i.invite_id = p_invite_id and i.expires_at > now();
  if not found then raise exception 'Davet geçersiz ya da süresi dolmuş'; end if;
end $$;

create function public.join_space(p_invite_id text, p_person uuid, p_wrapped_key text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_space uuid;
begin
  perform public.require_person(p_person);
  delete from public.space_invites i where i.invite_id = p_invite_id and i.expires_at > now() returning i.space_id into v_space;
  if v_space is null then raise exception 'Davet geçersiz ya da süresi dolmuş'; end if;
  if (select count(*) from public.space_members where person_id = p_person) >= 20 then
    raise exception 'En fazla 20 ortak alana üye olabilirsin';
  end if;
  insert into public.space_members (space_id, person_id, role, display_name, wrapped_key)
  values (v_space, p_person, 'member', p_display_name, p_wrapped_key)
  on conflict (space_id, person_id) do update set wrapped_key = excluded.wrapped_key,
    display_name = coalesce(excluded.display_name, public.space_members.display_name);
  return v_space;
end $$;

-- The owner removes anyone; anyone removes themselves. The last one out deletes the space.
create function public.remove_space_member(p_space uuid, p_actor uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_next uuid;
begin
  perform public.require_person(p_actor);
  if p_actor <> p_target and not exists (
    select 1 from public.space_members where space_id = p_space and person_id = p_actor and role = 'owner') then
    raise exception 'Yalnızca alanı kuran kişi başkasını çıkarabilir';
  end if;
  delete from public.space_members where space_id = p_space and person_id = p_target;
  if not found then return; end if;
  if not exists (select 1 from public.space_members where space_id = p_space) then
    delete from public.workspaces where id = p_space and kind = 'shared';
    return;
  end if;
  if not exists (select 1 from public.space_members where space_id = p_space and role = 'owner') then
    select person_id into v_next from public.space_members where space_id = p_space order by joined_at limit 1;
    update public.space_members set role = 'owner' where space_id = p_space and person_id = v_next;
  end if;
end $$;

-- Device pairing and recovery stay inside personal workspaces.
create or replace function public.offer_key_transfer(p_workspace_id uuid, p_transfer_id text, p_wrapped text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_direct_member(p_workspace_id)
     or exists (select 1 from public.workspaces where id = p_workspace_id and kind <> 'personal') then
    raise exception 'Not allowed';
  end if;
  delete from public.key_transfers where expires_at < now() or created_by = auth.uid();
  insert into public.key_transfers (transfer_id, workspace_id, wrapped) values (p_transfer_id, p_workspace_id, p_wrapped);
end $$;

-- ── "New note in your shared space" push ───────────────────────────────────────
-- Never blocks the insert: a missing pg_net/vault or a failed request is ignored.
create function public.notify_space_note() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from public.workspaces where id = new.workspace_id and kind = 'shared') then
    begin
      perform net.http_post(
        url := 'http://functions:9000/send-action-push',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'action_push_webhook_secret')),
        body := jsonb_build_object('type', 'INSERT', 'schema', 'public', 'table', 'notes', 'record', jsonb_build_object('id', new.id)),
        timeout_milliseconds := 10000);
    exception when others then null;
    end;
  end if;
  return new;
end $$;
create trigger notify_space_note after insert on public.notes
for each row execute function public.notify_space_note();

revoke all on function public.require_person(uuid) from public, anon, authenticated;
revoke all on function public.is_direct_member(uuid) from public, anon;
grant execute on function public.is_direct_member(uuid) to authenticated;
revoke all on function public.notify_space_note() from public, anon, authenticated;
revoke all on function public.create_space(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.rename_space(uuid, text) from public, anon;
revoke all on function public.set_space_display_name(uuid, uuid, text) from public, anon;
revoke all on function public.create_space_invite(uuid, uuid, text, text) from public, anon;
revoke all on function public.peek_space_invite(text) from public, anon;
revoke all on function public.join_space(text, uuid, text, text) from public, anon;
revoke all on function public.remove_space_member(uuid, uuid, uuid) from public, anon;
grant execute on function public.create_space(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.rename_space(uuid, text) to authenticated;
grant execute on function public.set_space_display_name(uuid, uuid, text) to authenticated;
grant execute on function public.create_space_invite(uuid, uuid, text, text) to authenticated;
grant execute on function public.peek_space_invite(text) to authenticated;
grant execute on function public.join_space(text, uuid, text, text) to authenticated;
grant execute on function public.remove_space_member(uuid, uuid, uuid) to authenticated;

commit;
