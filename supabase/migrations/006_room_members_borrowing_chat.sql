-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: Member wardrobes, borrow requests, Room chat, original images
--
-- Requires 005 (Rooms). Purely additive for existing data:
--   * get_room_members() also returns each member's avatar and how many
--     items they shared into the room (function replaced, same arguments)
--   * wardrobe_items.original_image_url (nullable) keeps the untouched photo
--     next to a background-removed image; existing rows stay NULL
--   * borrow_requests: one row per request; created and answered only
--     through the functions below, visible only to requester and owner
--   * room_messages: per-room chat, readable and writable by members only,
--     published to Supabase Realtime
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Original photo alongside the processed one ─────────────────────────────

ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS original_image_url TEXT;

-- ── Members with avatar and per-member shared-item count ───────────────────

-- The return type changes, so the function must be dropped and recreated
DROP FUNCTION IF EXISTS public.get_room_members(UUID);

CREATE FUNCTION public.get_room_members(p_room UUID)
RETURNS TABLE (
  user_id UUID,
  role TEXT,
  joined_at TIMESTAMPTZ,
  display_name TEXT,
  avatar_url TEXT,
  shared_count INT,
  is_me BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    m.user_id,
    m.role,
    m.joined_at,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(u.email, '@', 1), ''),
      'Member'
    ),
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'picture'), '')
    ),
    (SELECT count(*)::INT FROM public.room_items ri
     WHERE ri.room_id = m.room_id AND ri.shared_by = m.user_id),
    m.user_id = auth.uid()
  FROM public.room_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.room_id = p_room
    AND private.is_room_member(p_room)
  ORDER BY (m.role = 'owner') DESC, m.joined_at;
$$;

REVOKE ALL ON FUNCTION public.get_room_members(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_members(UUID) TO authenticated;

-- ── Borrow requests ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.borrow_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID        NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  item_id      UUID        NOT NULL,
  owner_id     UUID        NOT NULL,
  requester_id UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  message      TEXT        CHECK (message IS NULL OR char_length(message) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (owner_id <> requester_id),
  -- owner_id is provably the item's owner; deleting the item removes its requests
  FOREIGN KEY (item_id, owner_id)
    REFERENCES public.wardrobe_items (id, user_id) ON DELETE CASCADE
);

-- At most one pending request per item and requester
CREATE UNIQUE INDEX IF NOT EXISTS borrow_requests_one_pending_idx
  ON public.borrow_requests (item_id, requester_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS borrow_requests_room_idx ON public.borrow_requests (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS borrow_requests_owner_idx ON public.borrow_requests (owner_id);
CREATE INDEX IF NOT EXISTS borrow_requests_requester_idx ON public.borrow_requests (requester_id);

ALTER TABLE public.borrow_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "borrow_requests_select_party" ON public.borrow_requests;
CREATE POLICY "borrow_requests_select_party"
  ON public.borrow_requests FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (requester_id, owner_id));

-- Reads only; every change goes through the functions below
REVOKE ALL ON public.borrow_requests FROM anon, authenticated;
GRANT SELECT ON public.borrow_requests TO authenticated;

-- Ask to borrow an item that its owner shared into this room
CREATE OR REPLACE FUNCTION public.request_borrow(p_room UUID, p_item UUID, p_message TEXT DEFAULT NULL)
RETURNS public.borrow_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  uid UUID := auth.uid();
  item_owner UUID;
  created public.borrow_requests;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT private.is_room_member(p_room) THEN
    RAISE EXCEPTION 'You are not a member of this room' USING ERRCODE = '42501';
  END IF;

  SELECT ri.shared_by INTO item_owner
  FROM public.room_items ri
  JOIN public.room_members owner_m
    ON owner_m.room_id = ri.room_id AND owner_m.user_id = ri.shared_by
  WHERE ri.room_id = p_room AND ri.item_id = p_item;

  IF item_owner IS NULL THEN
    RAISE EXCEPTION 'This item is not shared in this room' USING ERRCODE = 'P0002';
  END IF;
  IF item_owner = uid THEN
    RAISE EXCEPTION 'You cannot borrow your own item' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.borrow_requests (room_id, item_id, owner_id, requester_id, message)
    VALUES (p_room, p_item, item_owner, uid, nullif(btrim(p_message), ''))
    RETURNING * INTO created;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You already have a pending request for this item' USING ERRCODE = '23505';
  END;

  RETURN created;
END;
$$;

-- The item's owner accepts or declines a pending request
CREATE OR REPLACE FUNCTION public.respond_borrow_request(p_request UUID, p_accept BOOLEAN)
RETURNS public.borrow_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  updated public.borrow_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  UPDATE public.borrow_requests
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
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

-- The requester withdraws their own pending request
CREATE OR REPLACE FUNCTION public.cancel_borrow_request(p_request UUID)
RETURNS public.borrow_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  updated public.borrow_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  UPDATE public.borrow_requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_request AND requester_id = auth.uid() AND status = 'pending'
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'Request not found, not yours to cancel, or no longer pending' USING ERRCODE = 'P0002';
  END IF;
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.request_borrow(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_borrow_request(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_borrow_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_borrow(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_borrow_request(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_borrow_request(UUID) TO authenticated;

-- ── Room chat ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.room_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID        NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  sender_id  UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  body       TEXT        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_messages_room_created_idx
  ON public.room_messages (room_id, created_at);

ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_messages_select_member" ON public.room_messages;
DROP POLICY IF EXISTS "room_messages_insert_member" ON public.room_messages;

CREATE POLICY "room_messages_select_member"
  ON public.room_messages FOR SELECT TO authenticated
  USING ((SELECT private.is_room_member(room_id)));

CREATE POLICY "room_messages_insert_member"
  ON public.room_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND (SELECT private.is_room_member(room_id))
  );

-- Messages cannot be edited or deleted by clients
REVOKE ALL ON public.room_messages FROM anon, authenticated;
GRANT SELECT, INSERT ON public.room_messages TO authenticated;

-- Live updates: Realtime delivers only rows the subscriber may SELECT (RLS)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'room_messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
  END IF;
END $$;
