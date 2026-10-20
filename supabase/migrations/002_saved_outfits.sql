-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Saved Outfits table with Row Level Security
-- Run this in the Supabase SQL editor:
--   Dashboard → SQL Editor → paste this file → Run
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  occasion TEXT,
  style TEXT,
  styling_notes TEXT,
  item_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security: users see and modify only their own saved outfits
ALTER TABLE saved_outfits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own saved outfits"
  ON saved_outfits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own saved outfits"
  ON saved_outfits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own saved outfits"
  ON saved_outfits FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own saved outfits"
  ON saved_outfits FOR DELETE
  USING (auth.uid() = user_id);
