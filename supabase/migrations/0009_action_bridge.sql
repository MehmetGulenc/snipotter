-- Review only: do not apply to a remote database as part of development.
begin;
create table public.device_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sender_device text not null check (char_length(sender_device) between 1 and 200),
  target_platform text not null default 'ios' check (target_platform in ('ios','any')),
  kind text not null check (kind in ('phone','address','iban','url','text')),
  payload text not null check (char_length(payload) between 1 and 2000),
  label text check (char_length(label) <= 200),
  clip_id uuid references public.clipboard_items(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes')
);
create index device_actions_workspace_created on public.device_actions(workspace_id, created_at desc);
create index device_actions_sender_created on public.device_actions(sender_user_id, created_at desc);
alter table public.device_actions enable row level security;
create policy actions_read on public.device_actions for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy actions_insert on public.device_actions for insert to authenticated
  with check (sender_user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy actions_consume on public.device_actions for update to authenticated
  using (public.is_workspace_member(workspace_id) and expires_at > now() and consumed_at is null)
  with check (public.is_workspace_member(workspace_id) and consumed_at is not null);
-- Column grants prevent mutation of sender, payload, workspace or expiry during consumption.
revoke all on public.device_actions from anon, authenticated;
grant select, insert on public.device_actions to authenticated;
grant update(consumed_at) on public.device_actions to authenticated;
create function public.guard_device_action() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    -- A per-sender transaction lock makes concurrent inserts obey the same limit.
    perform pg_advisory_xact_lock(hashtextextended(new.sender_user_id::text, 9));
    if (select count(*) from public.device_actions
        where sender_user_id = new.sender_user_id and created_at > now() - interval '1 minute') >= 10 then
      raise exception 'Action rate limit exceeded' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.expires_at := now() + interval '10 minutes';
    new.consumed_at := null;
    if new.clip_id is not null and not exists (
      select 1 from public.clipboard_items where id = new.clip_id and workspace_id = new.workspace_id
    ) then raise exception 'Clip workspace mismatch'; end if;
  else
    new.consumed_at := now();
  end if;
  return new;
end;
$$;
create trigger guard_device_action before insert or update on public.device_actions
for each row execute function public.guard_device_action();

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64,512}$'),
  platform text not null default 'ios' check (platform = 'ios'),
  environment text not null check (environment in ('sandbox','production')),
  device_name text check (char_length(device_name) <= 200),
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
create policy tokens_read on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy tokens_insert on public.push_tokens for insert to authenticated
with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy tokens_update on public.push_tokens for update to authenticated using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy tokens_delete on public.push_tokens for delete to authenticated using (user_id = auth.uid());
revoke all on public.push_tokens from anon, authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
create trigger touch_push_tokens before update on public.push_tokens
for each row execute function public.touch_updated_at();
-- push_tokens is deliberately excluded from realtime.
alter table public.device_actions replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.device_actions;
exception when duplicate_object then null; end $$;
commit;
