-- ============================================================================
-- 0004_member_remove.sql
-- ----------------------------------------------------------------------------
-- The original "wm self delete" policy only let a user remove their own
-- workspace_members row, which meant the desktop / web Settings UI couldn't
-- offer a "remove this device" button for the user's other paired devices.
--
-- For a single-user-with-many-devices product this is fine: anyone in the
-- workspace can kick anyone else (we trust everyone who knows the pair
-- code). Replaces the self-only policy with a workspace-member policy.
-- ============================================================================

drop policy if exists "wm self delete" on public.workspace_members;
drop policy if exists "wm member delete" on public.workspace_members;

create policy "wm member delete" on public.workspace_members for delete
  using (public.is_workspace_member(workspace_id));
