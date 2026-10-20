-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001: Baseline schema (wardrobe_items + wardrobe-images bucket)
--
-- Reproduces the live schema for fresh installations. On the existing
-- project every statement is a no-op or additive: the table, columns and
-- bucket already exist, so no data, image URL or bucket setting is changed.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. wardrobe_items (column types match the live project)
CREATE TABLE IF NOT EXISTS public.wardrobe_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL DEFAULT auth.uid()
                           REFERENCES auth.users (id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  category     TEXT        NOT NULL,
  style_branch TEXT,
  subcategory  TEXT,
  color        TEXT,
  material     TEXT,
  pattern      TEXT,
  occasion     TEXT,
  style        TEXT,
  brand        TEXT,
  notes        TEXT,
  image_url    TEXT,
  is_favorite  BOOLEAN     NOT NULL DEFAULT false,
  is_shared    BOOLEAN     NOT NULL DEFAULT false,
  room_ids     UUID[]      NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Taxonomy columns for installs created before they existed
ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS style_branch TEXT,
  ADD COLUMN IF NOT EXISTS subcategory  TEXT;

-- 3. Supports the owner-only RLS policies and the newest-first closet query
CREATE INDEX IF NOT EXISTS wardrobe_items_user_id_created_at_idx
  ON public.wardrobe_items (user_id, created_at DESC);

-- 4. Public bucket: existing public image URLs keep working.
--    ON CONFLICT DO NOTHING leaves the live bucket untouched.
INSERT INTO storage.buckets (id, name, public)
VALUES ('wardrobe-images', 'wardrobe-images', true)
ON CONFLICT (id) DO NOTHING;
