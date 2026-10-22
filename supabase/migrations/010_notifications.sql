-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010: Notification centre
--
-- Requires 005–007 and 009 (item numbers are shown). Additive:
--   * public.notifications: one row per recipient and event. Created only by
--     the triggers below (clients cannot insert); a recipient can read their
--     own rows and set read_at, nothing else.
--   * Events, from data the app already records:
--       room_message      a member sent a chat message (everyone in the room but
--                         the sender)
--       borrow_requested  someone asked to borrow your item       → item owner
--       borrow_accepted   your request was accepted (with reply)  → requester
--       borrow_declined   your request was declined (with reply)  → requester
--       borrow_cancelled  a request for your item was withdrawn   → item owner
--   * Borrow notifications respect the existing Profile setting
--     user_metadata.notify_borrow_requests (on unless set to false). Chat
--     notifications are not affected by it.
--   * get_my_notifications(): the caller's notifications, newest first, with
--     names, room, item and message preview looked up at read time (nothing
--     personal is copied into the table). Previews are shown only while the
--     recipient is still a member of the room.
--
-- Duplicates are impossible: UNIQUE (recipient_id, event_key) and every insert
-- uses ON CONFLICT DO NOTHING; each event key names one underlying action.
-- A failure while notifying never blocks the message or borrow action itself.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type         TEXT        NOT NULL CHECK (type IN (
                 'room_message', 'borrow_requested', 'borrow_accepted',
                 'borrow_declined', 'borrow_cancelled')),
  actor_id     UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  room_id      UUID        REFERENCES public.rooms (id) ON DELETE SET NULL,
  message_id   UUID        REFERENCES public.room_messages (id) ON DELETE SET NULL,
  request_id   UUID        REFERENCES public.borrow_requests (id) ON DELETE SET NULL,
  item_id      UUID        REFERENCES public.wardrobe_items (id) ON DELETE SET NULL,
  event_key    TEXT        NOT NULL,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_recipient_event_key UNIQUE (recipient_id, event_key)
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_id) WHERE read_at IS NULL;

-- ── Access: read your own, mark your own as read; nothing else ─────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = (SELECT auth.uid()))
  WITH CHECK (recipient_id = (SELECT auth.uid()));

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- The existing Profile switch: borrow notifications are on unless set to false
CREATE OR REPLACE FUNCTION private.wants_borrow_notifications(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT (u.raw_user_meta_data ->> 'notify_borrow_requests') IS DISTINCT FROM 'false'
     FROM auth.users u WHERE u.id = p_user),
    true
  );
$$;
REVOKE ALL ON FUNCTION private.wants_borrow_notifications(UUID) FROM PUBLIC, anon, authenticated;

-- ── Event triggers ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.notify_room_message()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.notifications (recipient_id, type, actor_id, room_id, message_id, event_key)
    SELECT m.user_id, 'room_message', NEW.sender_id, NEW.room_id, NEW.id, 'message:' || NEW.id
    FROM public.room_members m
    WHERE m.room_id = NEW.room_id AND m.user_id <> NEW.sender_id
    ON CONFLICT ON CONSTRAINT notifications_recipient_event_key DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_room_message skipped: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.notify_borrow_request()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_type TEXT;
  v_recipient UUID;
  v_actor UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN RETURN NULL; END IF;
    v_type := 'borrow_requested'; v_recipient := NEW.owner_id; v_actor := NEW.requester_id;
  ELSIF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') THEN
    v_type := 'borrow_' || NEW.status; v_recipient := NEW.requester_id; v_actor := NEW.owner_id;
  ELSIF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
    v_type := 'borrow_cancelled'; v_recipient := NEW.owner_id; v_actor := NEW.requester_id;
  ELSE
    RETURN NULL; -- not a status change worth telling anyone about
  END IF;

  IF v_recipient = v_actor OR NOT private.wants_borrow_notifications(v_recipient) THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.notifications (recipient_id, type, actor_id, room_id, request_id, item_id, event_key)
    VALUES (v_recipient, v_type, v_actor, NEW.room_id, NEW.id, NEW.item_id, 'borrow:' || NEW.id || ':' || v_type)
    ON CONFLICT ON CONSTRAINT notifications_recipient_event_key DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_borrow_request skipped: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_room_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.notify_borrow_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS room_messages_notify ON public.room_messages;
CREATE TRIGGER room_messages_notify
  AFTER INSERT ON public.room_messages
  FOR EACH ROW EXECUTE FUNCTION private.notify_room_message();

DROP TRIGGER IF EXISTS borrow_requests_notify_insert ON public.borrow_requests;
CREATE TRIGGER borrow_requests_notify_insert
  AFTER INSERT ON public.borrow_requests
  FOR EACH ROW EXECUTE FUNCTION private.notify_borrow_request();

DROP TRIGGER IF EXISTS borrow_requests_notify_status ON public.borrow_requests;
CREATE TRIGGER borrow_requests_notify_status
  AFTER UPDATE OF status ON public.borrow_requests
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION private.notify_borrow_request();

-- ── Reading ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  type TEXT,
  created_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  actor_id UUID,
  actor_name TEXT,
  actor_avatar_url TEXT,
  room_id UUID,
  room_name TEXT,
  message_id UUID,
  message_preview TEXT,
  request_id UUID,
  request_status TEXT,
  response_message TEXT,
  item_id UUID,
  item_name TEXT,
  item_number INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    n.id, n.type, n.created_at, n.read_at, n.actor_id,
    CASE WHEN a.id IS NULL THEN NULL ELSE coalesce(
      nullif(btrim(a.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(a.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(a.email, '@', 1), ''),
      'Member') END,
    coalesce(nullif(btrim(a.raw_user_meta_data ->> 'avatar_url'), ''),
             nullif(btrim(a.raw_user_meta_data ->> 'picture'), '')),
    n.room_id,
    CASE WHEN still_member THEN r.name END,
    n.message_id,
    CASE WHEN still_member AND msg.id IS NOT NULL THEN left(msg.body, 160) END,
    n.request_id,
    br.status,
    CASE WHEN n.type IN ('borrow_accepted', 'borrow_declined') THEN br.response_message END,
    n.item_id,
    w.name,
    w.item_number
  FROM public.notifications n
  LEFT JOIN auth.users a ON a.id = n.actor_id
  LEFT JOIN public.rooms r ON r.id = n.room_id
  LEFT JOIN public.room_messages msg ON msg.id = n.message_id
  LEFT JOIN public.borrow_requests br ON br.id = n.request_id
  LEFT JOIN public.wardrobe_items w ON w.id = n.item_id
  CROSS JOIN LATERAL (
    SELECT EXISTS (SELECT 1 FROM public.room_members m
                   WHERE m.room_id = n.room_id AND m.user_id = n.recipient_id) AS still_member
  ) sm
  WHERE n.recipient_id = (SELECT auth.uid())
  ORDER BY n.created_at DESC, n.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_my_notifications(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(INT) TO authenticated;

-- ── Live updates for the bell ───────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
