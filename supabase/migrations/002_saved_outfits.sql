-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: saved_outfits table with owner-only access
--
-- Creates the table the Outfit Builder and AI Stylist save to. Until this
-- runs, the app falls back to user_metadata + localStorage; those fallback
-- outfits are still merged in by the app and are not touched here.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.saved_outfits (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL DEFAULT auth.uid()
                            REFERENCES auth.users (id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  occasion      TEXT,
  style         TEXT,
  styling_notes TEXT,
  item_ids      TEXT[]      NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_outfits_user_id_created_at_idx
  ON public.saved_outfits (user_id, created_at DESC);

ALTER TABLE public.saved_outfits ENABLE ROW LEVEL SECURITY;

-- Replace whatever policies exist with the owner-only set below
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_outfits'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.saved_outfits', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "saved_outfits_select_own"
  ON public.saved_outfits FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "saved_outfits_insert_own"
  ON public.saved_outfits FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "saved_outfits_update_own"
  ON public.saved_outfits FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "saved_outfits_delete_own"
  ON public.saved_outfits FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Signed-out visitors get no access at all
REVOKE ALL ON public.saved_outfits FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_outfits TO authenticated;
