-- ============================================================================
-- 0003_replica_identity.sql
-- ----------------------------------------------------------------------------
-- Realtime DELETE events for `clipboard_items` and `notes` were not propagating
-- to other connected clients (the desktop app couldn't see web-side deletes).
--
-- Postgres logical replication ships only the primary key in `old` for DELETE
-- events when a table's REPLICA IDENTITY is the default. Supabase Realtime
-- uses the row-level filter (e.g. `workspace_id=eq.<id>`) against the `old`
-- payload for DELETE events, so the filter never matches and the event is
-- discarded.
--
-- Setting REPLICA IDENTITY FULL makes Postgres include the full pre-image of
-- the row, which lets Realtime evaluate the workspace filter correctly.
-- Storage cost: a few extra bytes per UPDATE/DELETE in the WAL — negligible
-- for our row sizes.
--
-- Safe to re-run; ALTER ... REPLICA IDENTITY is idempotent.
-- ============================================================================

alter table public.clipboard_items replica identity full;
alter table public.notes replica identity full;
