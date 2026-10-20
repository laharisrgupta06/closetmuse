-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Per-user writes and deletes in the wardrobe-images bucket
--
-- New uploads must go to "<auth.uid()>/<file>". A user may read, replace or
-- delete an object only if it is in their own folder, or if Storage recorded
-- them as its uploader (owner_id). The owner_id rule covers the legacy
-- "public/..." images uploaded before per-user folders existed.
--
-- The bucket stays public, so every existing image URL keeps working:
-- public URLs are served without consulting these policies.
--
-- Failure mode is closed: if this stops after dropping policies, uploads and
-- deletes are refused but public image URLs still load.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Keep the bucket public; accept only images up to 25 MiB on new uploads.
--    Existing objects are not re-validated.
UPDATE storage.buckets
SET public             = true,
    file_size_limit    = 26214400,
    allowed_mime_types = ARRAY[
      'image/png', 'image/jpeg', 'image/webp',
      'image/heic', 'image/heif', 'image/gif', 'image/avif'
    ]
WHERE id = 'wardrobe-images';

-- 2. Drop every existing policy that mentions this bucket (incl. anon ones)
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (coalesce(qual, '') ILIKE '%wardrobe-images%'
           OR coalesce(with_check, '') ILIKE '%wardrobe-images%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- 3. Owner-only policies
CREATE POLICY "wardrobe_images_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'wardrobe-images'
    AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text
         OR owner_id = (SELECT auth.uid())::text)
  );

CREATE POLICY "wardrobe_images_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'wardrobe-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "wardrobe_images_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'wardrobe-images'
    AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text
         OR owner_id = (SELECT auth.uid())::text)
  )
  WITH CHECK (
    bucket_id = 'wardrobe-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "wardrobe_images_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'wardrobe-images'
    AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text
         OR owner_id = (SELECT auth.uid())::text)
  );

-- 4. Warn about any remaining policy that would still let anyone in.
--    A policy that never names a bucket applies to every bucket, this one included.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname, cmd, roles FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname NOT LIKE 'wardrobe_images_%'
      AND coalesce(qual, '') NOT ILIKE '%bucket_id%'
      AND coalesce(with_check, '') NOT ILIKE '%bucket_id%'
  LOOP
    RAISE WARNING 'storage.objects policy "%" (% for %) is not bucket-scoped and still applies to wardrobe-images. Review it.',
      p.policyname, p.cmd, p.roles;
  END LOOP;
END $$;
