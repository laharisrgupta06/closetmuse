-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: Owner's reply when accepting or declining a borrow request
--
-- Requires 006. Additive:
--   * borrow_requests.response_message (nullable) holds the owner's optional
--     reply; the requester's own note stays in borrow_requests.message
--   * respond_borrow_request gains an optional p_response argument. Callers
--     that pass only (p_request, p_accept) keep working unchanged.
--
-- The status change and the reply are written by one UPDATE, so they are
-- saved together or not at all. Blank replies are stored as NULL. Only the
-- item's owner can answer, and only while the request is pending.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.borrow_requests
  ADD COLUMN IF NOT EXISTS response_message TEXT
    CHECK (response_message IS NULL OR char_length(response_message) <= 500);

-- Replace the 2-argument version with one taking an optional reply
DROP FUNCTION IF EXISTS public.respond_borrow_request(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.respond_borrow_request(
  p_request UUID,
  p_accept BOOLEAN,
  p_response TEXT DEFAULT NULL
)
RETURNS public.borrow_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  updated public.borrow_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_response IS NOT NULL AND char_length(btrim(p_response)) > 500 THEN
    RAISE EXCEPTION 'Replies can be up to 500 characters' USING ERRCODE = '22001';
  END IF;

  UPDATE public.borrow_requests
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
      response_message = nullif(btrim(p_response), ''),
      responded_at = now(),
      updated_at = now()
  WHERE id = p_request AND owner_id = auth.uid() AND status = 'pending'
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'Request not found, not yours to answer, or already answered' USING ERRCODE = 'P0002';
  END IF;
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_borrow_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_borrow_request(UUID, BOOLEAN, TEXT) TO authenticated;
