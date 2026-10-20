-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001: Wardrobe Storage + taxonomy columns
-- Run this once in the Supabase SQL editor:
--   Dashboard → SQL Editor → paste this file → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add new taxonomy columns to wardrobe_items (safe, idempotent)
ALTER TABLE wardrobe_items
  ADD COLUMN IF NOT EXISTS style_branch TEXT,
  ADD COLUMN IF NOT EXISTS subcategory  TEXT;

-- 2. Create the wardrobe-images storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('wardrobe-images', 'wardrobe-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Allow public read of all objects in wardrobe-images
CREATE POLICY IF NOT EXISTS "Public read wardrobe images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'wardrobe-images');

-- 4. Allow authenticated users to upload into wardrobe-images
CREATE POLICY IF NOT EXISTS "Authenticated upload wardrobe images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'wardrobe-images');

-- 5. Allow authenticated users to delete their own uploads
CREATE POLICY IF NOT EXISTS "Authenticated delete wardrobe images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'wardrobe-images');

-- 6. Row-level security: users see only their own wardrobe items
ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users read own wardrobe"
  ON wardrobe_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users insert own wardrobe"
  ON wardrobe_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users update own wardrobe"
  ON wardrobe_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users delete own wardrobe"
  ON wardrobe_items FOR DELETE
  USING (auth.uid() = user_id);
