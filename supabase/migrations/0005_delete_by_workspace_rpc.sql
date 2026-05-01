-- Snipotter v0.3.2 — Workspace-member delete RPC
-- Fixes the "ghost note" bug: when a note was created by a previous anonymous
-- session, the standard DELETE … WHERE id = ? is blocked by RLS (auth.uid()
-- doesn't match created_by). The client falls back to this RPC which verifies
-- workspace membership instead, so any member of the workspace can delete any
-- note in that workspace.
--
-- Run in: Supabase Dashboard → SQL Editor (or push via `supabase db push`).

create or replace function public.delete_note_by_workspace(
  p_note_id    uuid,
  p_workspace_id uuid
)
returns void
language plpgsql
security definer          -- runs as the function owner (postgres), bypassing RLS
set search_path = public
as $$
begin
  -- Guard: caller must be an active member of the workspace.
  -- This is the only security check we need; we don't require the caller to
  -- be the note creator, which is the whole point of this fallback.
  if not exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id      = auth.uid()
  ) then
    raise exception 'Not a member of workspace %', p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  -- Perform the delete. The function owns the execution context so RLS is
  -- bypassed, but the membership check above means only legitimate members
  -- can reach this point.
  delete from public.notes
  where id           = p_note_id
    and workspace_id = p_workspace_id;   -- belt-and-suspenders: scope to workspace
end;
$$;

-- Grant execute to the authenticated role (anon users are authenticated after
-- anonymous sign-in, so this covers the typical Snipotter user).
grant execute on function public.delete_note_by_workspace(uuid, uuid)
  to authenticated, anon;
