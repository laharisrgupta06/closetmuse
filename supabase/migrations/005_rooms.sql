-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Rooms — private groups, invite codes, selective sharing
--
-- Requires 001–004 (owner-only wardrobe_items RLS).
--
--   rooms          one row per Room; private; unique 8-character invite code
--   room_members   many-to-many users ↔ rooms (role: owner | member)
--   room_items     which wardrobe items an owner shared into which Room.
--                  Sharing never copies an item, and unsharing never deletes it.
--
-- Rooms and memberships are only created through create_room() / join_room();
-- clients cannot insert them directly. A member sees a Room, its members and
-- its shared items; nobody else does. Unshared wardrobe items stay owner-only.
--
-- Safe to re-run. Changes nothing in existing tables except: one extra
-- SELECT policy on wardrobe_items (shared-item visibility) and a UNIQUE
-- (id, user_id) constraint used to prove item ownership in room_items.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper functions live in a schema the Data API does not expose
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rooms (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description TEXT        CHECK (description IS NULL OR char_length(description) <= 500),
  invite_code TEXT        NOT NULL UNIQUE CHECK (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_by  UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  is_private  BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_members (
  room_id   UUID        NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role      TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS room_members_user_id_idx ON public.room_members (user_id);

-- Lets room_items reference (item, owner) so a share can only name the item's owner
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wardrobe_items_id_user_id_key'
      AND conrelid = 'public.wardrobe_items'::regclass
  ) THEN
    ALTER TABLE public.wardrobe_items
      ADD CONSTRAINT wardrobe_items_id_user_id_key UNIQUE (id, user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.room_items (
  room_id   UUID        NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  item_id   UUID        NOT NULL,
  shared_by UUID        NOT NULL DEFAULT auth.uid(),
  shared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, item_id),
  -- Deleting the wardrobe item removes its shares; shared_by must be its owner
  FOREIGN KEY (item_id, shared_by)
    REFERENCES public.wardrobe_items (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS room_items_item_id_idx ON public.room_items (item_id);

-- ── Helper functions (SECURITY DEFINER avoids recursive RLS lookups) ───────

CREATE OR REPLACE FUNCTION private.is_room_member(p_room UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members m
    WHERE m.room_id = p_room AND m.user_id = (SELECT auth.uid())
  );
$$;

-- True when the item is shared into a Room where both the caller and the
-- person who shared it are members
CREATE OR REPLACE FUNCTION private.can_view_shared_item(p_item UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_items ri
    JOIN public.room_members viewer
      ON viewer.room_id = ri.room_id AND viewer.user_id = (SELECT auth.uid())
    JOIN public.room_members sharer
      ON sharer.room_id = ri.room_id AND sharer.user_id = ri.shared_by
    WHERE ri.item_id = p_item
  );
$$;

-- 8 characters from an unambiguous alphabet (no I, O, 0, 1): ~1.1 × 10^12 codes
CREATE OR REPLACE FUNCTION private.generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SET search_path = ''
AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  -- Random bytes of a v4 UUID; bytes 6 and 8 carry version/variant bits
  bytes BYTEA := uuid_send(gen_random_uuid());
  positions CONSTANT INT[] := ARRAY[0, 1, 2, 3, 4, 5, 9, 10];
  code TEXT := '';
  pos INT;
BEGIN
  FOREACH pos IN ARRAY positions LOOP
    code := code || substr(alphabet, (get_byte(bytes, pos) % 32) + 1, 1);
  END LOOP;
  RETURN code;
END;
$$;

REVOKE ALL ON FUNCTION private.is_room_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_view_shared_item(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.generate_invite_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_room_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_shared_item(UUID) TO authenticated;

-- ── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('rooms', 'room_members', 'room_items')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "wardrobe_items_select_shared" ON public.wardrobe_items;

-- Rooms and members: visible to members only. No INSERT/UPDATE/DELETE
-- policies, so writes only happen through the functions below.
CREATE POLICY "rooms_select_member"
  ON public.rooms FOR SELECT TO authenticated
  USING ((SELECT private.is_room_member(id)));

CREATE POLICY "room_members_select_member"
  ON public.room_members FOR SELECT TO authenticated
  USING ((SELECT private.is_room_member(room_id)));

-- Shared items: members see what is shared in their Rooms
CREATE POLICY "room_items_select_member"
  ON public.room_items FOR SELECT TO authenticated
  USING ((SELECT private.is_room_member(room_id)));

-- Only a member may share, only their own item, only as themselves
CREATE POLICY "room_items_insert_own_item"
  ON public.room_items FOR INSERT TO authenticated
  WITH CHECK (
    shared_by = (SELECT auth.uid())
    AND (SELECT private.is_room_member(room_id))
    AND EXISTS (
      SELECT 1 FROM public.wardrobe_items w
      WHERE w.id = item_id AND w.user_id = (SELECT auth.uid())
    )
  );

-- Only the person who shared an item can stop sharing it
CREATE POLICY "room_items_delete_own"
  ON public.room_items FOR DELETE TO authenticated
  USING (shared_by = (SELECT auth.uid()));

-- Room members can read items shared with them (in addition to 003's
-- owner-only policies; UPDATE and DELETE stay owner-only)
CREATE POLICY "wardrobe_items_select_shared"
  ON public.wardrobe_items FOR SELECT TO authenticated
  USING (private.can_view_shared_item(id));

REVOKE ALL ON public.rooms, public.room_members, public.room_items FROM anon;
REVOKE ALL ON public.rooms, public.room_members, public.room_items FROM authenticated;
GRANT SELECT ON public.rooms, public.room_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.room_items TO authenticated;

-- ── API functions ───────────────────────────────────────────────────────────

-- Creates a private Room with a unique invite code; the caller becomes owner
CREATE OR REPLACE FUNCTION public.create_room(p_name TEXT, p_description TEXT DEFAULT NULL)
RETURNS public.rooms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  uid UUID := auth.uid();
  new_room public.rooms;
  attempts INT := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Room name is required' USING ERRCODE = '22023';
  END IF;

  LOOP
    BEGIN
      INSERT INTO public.rooms (name, description, invite_code, created_by)
      VALUES (btrim(p_name), nullif(btrim(p_description), ''), private.generate_invite_code(), uid)
      RETURNING * INTO new_room;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
      IF attempts >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  INSERT INTO public.room_members (room_id, user_id, role)
  VALUES (new_room.id, uid, 'owner');

  RETURN new_room;
END;
$$;

-- Joins the Room with this invite code (case, spaces and dashes ignored).
-- Every unknown code gets the same error, so lookups reveal nothing else.
CREATE OR REPLACE FUNCTION public.join_room(p_code TEXT)
RETURNS public.rooms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  uid UUID := auth.uid();
  target public.rooms;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO target FROM public.rooms
  WHERE invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite code' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.room_members (room_id, user_id, role)
  VALUES (target.id, uid, 'member')
  ON CONFLICT (room_id, user_id) DO NOTHING;

  RETURN target;
END;
$$;

-- Members of a Room with display names, for members of that Room only
CREATE OR REPLACE FUNCTION public.get_room_members(p_room UUID)
RETURNS TABLE (user_id UUID, role TEXT, joined_at TIMESTAMPTZ, display_name TEXT, is_me BOOLEAN)
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
    m.user_id = auth.uid()
  FROM public.room_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.room_id = p_room
    AND private.is_room_member(p_room)
  ORDER BY (m.role = 'owner') DESC, m.joined_at;
$$;

REVOKE ALL ON FUNCTION public.create_room(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_room(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_room_members(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_room(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_room_members(UUID) TO authenticated;
