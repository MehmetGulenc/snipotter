-- run-as: supabase_admin
-- storage.objects belongs to supabase_storage_admin, so creating its policies needs the
-- superuser role on self-hosted Supabase:
--   docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres < 0012_note_assets.sql
begin;

-- ── Note images (private Storage bucket) ─────────────────────────────────────
-- Object path: <workspace_id>/<note_id>/<uuid>.<ext>. Notes reference them as
-- "snipotter-asset:<path>" and clients show them through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-assets', 'note-assets', false, 10485760,
        array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create function public.asset_workspace(object_name text) returns uuid
language plpgsql immutable as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end $$;

create policy note_assets_read on storage.objects for select to authenticated
  using (bucket_id = 'note-assets' and public.is_workspace_member(public.asset_workspace(name)));
create policy note_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'note-assets' and public.is_workspace_member(public.asset_workspace(name)));
create policy note_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'note-assets' and public.is_workspace_member(public.asset_workspace(name)));

commit;
