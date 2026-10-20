-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Owner-only access to wardrobe_items
--
-- Removes the public SELECT/INSERT/UPDATE/DELETE policies and replaces them
-- with policies that let a signed-in user touch only rows where
-- user_id = auth.uid(). No rows or columns are modified.
--
-- Failure mode is closed: if this stops after dropping policies, RLS stays
-- enabled and nobody (except the service role) can read or write.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;

-- The live policy names are not under version control, so drop all of them
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'wardrobe_items'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.wardrobe_items', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "wardrobe_items_select_own"
  ON public.wardrobe_items FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "wardrobe_items_insert_own"
  ON public.wardrobe_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- WITH CHECK stops a user from reassigning their item to someone else
CREATE POLICY "wardrobe_items_update_own"
  ON public.wardrobe_items FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "wardrobe_items_delete_own"
  ON public.wardrobe_items FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Signed-out visitors get no access at all (the app never queries as anon)
REVOKE ALL ON public.wardrobe_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wardrobe_items TO authenticated;
