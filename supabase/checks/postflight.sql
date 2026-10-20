-- ─────────────────────────────────────────────────────────────────────────────
-- Post-flight checks — READ ONLY. Run in the SQL Editor after migrations
-- 001–005 (sections 6–9 need 005). Compare section 2 with pre-flight section 5.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Expected: RLS on for both tables, and exactly these policies:
--    wardrobe_items_{select,insert,update,delete}_own
--    saved_outfits_{select,insert,update,delete}_own
--    wardrobe_images_{select,insert,update,delete}_own
--    plus any policies for OTHER buckets (each must reference its bucket_id)
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('wardrobe_items', 'saved_outfits');

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('wardrobe_items', 'saved_outfits'))
   OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, policyname;

-- 2. Must equal the pre-flight counts
SELECT
  (SELECT count(*) FROM public.wardrobe_items)                              AS wardrobe_rows,
  (SELECT count(DISTINCT user_id) FROM public.wardrobe_items)               AS wardrobe_owners,
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'wardrobe-images') AS bucket_objects;

-- 3. Expected: no rows (anon has no table privileges)
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon'
  AND table_name IN ('wardrobe_items', 'saved_outfits');

-- 4. Expected: public = true, 26214400, image MIME types
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'wardrobe-images';

-- 5. Expected: no rows. Any policy listed here is not bucket-scoped and
--    still applies to wardrobe-images.
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname NOT LIKE 'wardrobe_images_%'
  AND coalesce(qual, '') NOT ILIKE '%bucket_id%'
  AND coalesce(with_check, '') NOT ILIKE '%bucket_id%';

-- ─── After 005 (Rooms) ──────────────────────────────────────────────────────

-- 6. Expected: rls_enabled = true for rooms, room_members, room_items
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('rooms', 'room_members', 'room_items');

-- 7. Expected policies: rooms_select_member, room_members_select_member,
--    room_items_select_member, room_items_insert_own_item, room_items_delete_own,
--    and wardrobe_items_select_shared alongside the four *_own policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('rooms', 'room_members', 'room_items', 'wardrobe_items')
ORDER BY tablename, policyname;

-- 8. Expected: no rows (anon has no access to Rooms tables)
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon'
  AND table_name IN ('rooms', 'room_members', 'room_items');

-- 9. Expected: authenticated = true, anon = false for all three functions
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('create_room', 'join_room', 'get_room_members');
