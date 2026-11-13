-- Device pairing by approval (docs/sifreleme-tasarimi.md, "Yeni cihaz"): the new device
-- posts an ECDH public key; any device that already holds the key taps "Onayla" and
-- answers with the workspace key sealed for that public key. The server only relays
-- public keys and ciphertext. Also: Live Activity push-to-start tokens (Dynamic Island).
begin;

create table public.key_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_name text check (char_length(device_name) <= 100),
  -- P-256 public keys, raw (uncompressed point, 65 bytes) in base64.
  public_key text not null check (char_length(public_key) between 80 and 100),
  approver_key text check (char_length(approver_key) between 80 and 100),
  wrapped text check (left(wrapped, 7) = 'enc:v1:' and char_length(wrapped) <= 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index key_requests_ws_idx on public.key_requests(workspace_id);
alter table public.key_requests enable row level security;
-- Devices of the personal workspace see requests (to approve them, or to read their answer).
create policy key_requests_read on public.key_requests for select to authenticated
  using (public.is_direct_member(workspace_id) and expires_at > now());
revoke all on public.key_requests from anon, authenticated;
grant select on public.key_requests to authenticated;

create function public.request_key(p_workspace_id uuid, p_public_key text, p_device_name text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_direct_member(p_workspace_id)
     or not exists (select 1 from public.workspaces where id = p_workspace_id and kind = 'personal' and encryption = 'v1') then
    raise exception 'Not allowed';
  end if;
  delete from public.key_requests where expires_at < now() or (user_id = auth.uid() and workspace_id = p_workspace_id);
  if (select count(*) from public.key_requests where workspace_id = p_workspace_id) >= 5 then
    raise exception 'Çok fazla bekleyen eşleştirme isteği var';
  end if;
  insert into public.key_requests (workspace_id, public_key, device_name)
  values (p_workspace_id, p_public_key, left(p_device_name, 100))
  returning id into v_id;
  return v_id;
end $$;

-- Only a device of the same workspace answers, never the requester itself, and only once.
create function public.answer_key_request(p_id uuid, p_approver_key text, p_wrapped text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.key_requests r set approver_key = p_approver_key, wrapped = p_wrapped
   where r.id = p_id and r.wrapped is null and r.expires_at > now() and r.user_id <> auth.uid()
     and public.is_direct_member(r.workspace_id);
  if not found then raise exception 'İstek bulunamadı ya da süresi dolmuş'; end if;
end $$;

-- "Reddet": the request goes away; a declined device is also removed from the workspace.
create function public.decline_key_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.key_requests;
begin
  select * into r from public.key_requests where id = p_id and public.is_direct_member(workspace_id);
  if r.id is null then return; end if;
  delete from public.key_requests where id = p_id;
  if r.user_id <> auth.uid() then
    delete from public.workspace_members where workspace_id = r.workspace_id and user_id = r.user_id;
  end if;
end $$;

-- The requester clears its answered request once the key is stored.
create function public.finish_key_request(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.key_requests where id = p_id and user_id = auth.uid();
$$;

revoke all on function public.request_key(uuid, text, text) from public, anon;
revoke all on function public.answer_key_request(uuid, text, text) from public, anon;
revoke all on function public.decline_key_request(uuid) from public, anon;
revoke all on function public.finish_key_request(uuid) from public, anon;
grant execute on function public.request_key(uuid, text, text) to authenticated;
grant execute on function public.answer_key_request(uuid, text, text) to authenticated;
grant execute on function public.decline_key_request(uuid) to authenticated;
grant execute on function public.finish_key_request(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.key_requests;
exception when duplicate_object or undefined_object then null; end $$;

-- ── Dynamic Island: Live Activity push-to-start tokens (iOS 17.2+) ─────────────
alter table public.push_tokens add column if not exists kind text not null default 'alert'
  check (kind in ('alert', 'activity'));

commit;
