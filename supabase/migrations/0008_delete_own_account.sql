-- Apply with a database administrator; never ship a service-role key to the client.
begin;
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Serialize deletion for this account. No caller-supplied target exists.
  perform 1 from auth.users where id = caller for update;
  if not found then
    raise exception 'Account not found' using errcode = '42501';
  end if;
  -- Remove personal content rather than leaving it anonymized by SET NULL FKs.
  delete from public.notes where created_by = caller;
  delete from public.clipboard_items where created_by = caller;
  -- used_by_user_id has a restrictive FK in schema 0002.
  delete from public.pair_codes where created_by = caller or used_by_user_id = caller;
  delete from public.workspace_members where user_id = caller;
  -- Shared workspaces and other members' content are deliberately preserved.
  delete from auth.users where id = caller;
end;
$$;
revoke all on function public.delete_own_account() from public, anon, authenticated;
grant execute on function public.delete_own_account() to authenticated;
commit;
