-- Snipotter Migration 001
-- Run this once in your Supabase SQL Editor.
--
-- Sets REPLICA IDENTITY FULL on the two main tables so that all columns
-- are available in the Postgres WAL for every INSERT / UPDATE / DELETE.
-- Required for the workspace_id server-side filter on postgres_changes
-- subscriptions to work correctly on DELETE events.
--
-- The ADD TABLE lines are intentionally omitted here: Supabase already
-- adds both tables to supabase_realtime by default in recent projects.
-- If you see "relation is not member of publication" errors, add:
--   ALTER PUBLICATION supabase_realtime ADD TABLE clipboard_items;
--   ALTER PUBLICATION supabase_realtime ADD TABLE notes;

ALTER TABLE clipboard_items REPLICA IDENTITY FULL;
ALTER TABLE notes REPLICA IDENTITY FULL;
