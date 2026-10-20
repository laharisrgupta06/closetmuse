-- ─────────────────────────────────────────────────────────────────────────────
-- Pre-flight checks — READ ONLY. Run in the SQL Editor before migrations
-- 001–004 and keep the output. Nothing here changes data or settings.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. RLS state
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('wardrobe_items', 'saved_outfits');

-- 2. Current policies (these are what 003/004 replace)
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('wardrobe_items', 'saved_outfits'))
   OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, policyname;

-- 3. Live wardrobe_items definition (compare with 001_baseline_schema.sql)
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'wardrobe_items'
ORDER BY ordinal_position;

-- 4. Bucket settings
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'wardrobe-images';

-- 5. Baseline counts — re-run after migrating; these must not change
SELECT
  (SELECT count(*) FROM public.wardrobe_items)                              AS wardrobe_rows,
  (SELECT count(DISTINCT user_id) FROM public.wardrobe_items)               AS wardrobe_owners,
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'wardrobe-images') AS bucket_objects;

-- 6. Rows whose owner is not a real account. After 003 these become
--    invisible in the app (still stored, readable via the service role).
SELECT w.user_id, count(*) AS rows
FROM public.wardrobe_items w
LEFT JOIN auth.users u ON u.id = w.user_id
WHERE u.id IS NULL
GROUP BY w.user_id;

-- 7. Legacy images: can their owners still delete them after 004?
--    owner_matches_item = true means the item's owner is the recorded uploader.
SELECT
  (storage.foldername(o.name))[1]       AS top_folder,
  o.owner_id IS NULL                    AS owner_id_missing,
  (o.owner_id = w.user_id::text)        AS owner_matches_item,
  count(*)                              AS objects
FROM storage.objects o
LEFT JOIN public.wardrobe_items w
  ON w.image_url LIKE '%/wardrobe-images/' || o.name
WHERE o.bucket_id = 'wardrobe-images'
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- 8. Items pointing at images that no longer exist in the bucket
SELECT count(*) AS items_with_missing_image
FROM public.wardrobe_items w
WHERE w.image_url LIKE '%/wardrobe-images/%'
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'wardrobe-images'
      AND w.image_url LIKE '%/wardrobe-images/' || o.name
  );

-- 9. Table privileges held by anon (003 revokes these)
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS anon_privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon'
  AND table_name IN ('wardrobe_items', 'saved_outfits')
GROUP BY table_name;
