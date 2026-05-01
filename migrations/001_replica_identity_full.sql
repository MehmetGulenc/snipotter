-- Snipotter Migration 001
-- Run this once in your Supabase SQL Editor.
--
-- Sets REPLICA IDENTITY FULL on the two main tables so that all columns
-- (not just the primary key) are available in the Postgres WAL for every
-- INSERT / UPDATE / DELETE event. This makes Supabase Realtime
-- postgres_changes payloads complete and ensures the cross-device
-- auto-mirror feature receives the full row on every change type.
--
-- Also enables Realtime tracking for both tables (required for
-- postgres_changes subscriptions to fire at all).

-- Enable realtime for clipboard_items
ALTER PUBLICATION supabase_realtime ADD TABLE clipboard_items;

-- Enable realtime for notes
ALTER PUBLICATION supabase_realtime ADD TABLE notes;

-- Full row in WAL for deletes — without this, DELETE events only carry
-- the primary key and workspace_id-based filters silently drop them.
ALTER TABLE clipboard_items REPLICA IDENTITY FULL;
ALTER TABLE notes REPLICA IDENTITY FULL;
