-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008: Optional design tradition for wardrobe items
--
-- Requires 001. Purely additive for existing data:
--   * wardrobe_items.design_tradition (nullable) records a design tradition
--     such as Kundan, Polki, Temple or Minimalist, mainly for jewellery.
--     Existing rows stay NULL; no values are inferred or rewritten.
--
-- It is separate from the other dimensions, which are unchanged:
--   category      main category (the existing 9 values)
--   subcategory   item type, e.g. "Jhumkas"
--   style_branch  aesthetic: Traditional, Western or Indo-Western
--   pattern       fabric pattern or craft
--
-- No new policies are needed: the column is covered by the existing
-- wardrobe_items RLS policies (owner write, owner and shared-room read).
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS design_tradition TEXT
    CHECK (design_tradition IS NULL OR char_length(design_tradition) <= 80);
