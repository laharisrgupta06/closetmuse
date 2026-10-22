-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 009: Permanent per-user numbers for wardrobe items and outfits
--
-- Requires 001–002 (and the private schema from 005). Additive:
--   * wardrobe_items.item_number: one sequence per user shared by every
--     category (clothing, jewellery, bags, shoes, accessories…), shown as #001
--   * saved_outfits.outfit_number: a separate sequence per user ("Outfit #001")
--   * private.number_counters: the last number handed out per user and kind.
--     Not exposed through the API; only the triggers below touch it.
--
-- Guarantees:
--   * Assigned by the database on INSERT; any number sent by a client is ignored.
--   * Never changes on UPDATE (edits keep their number).
--   * Never reused after a delete: counters only ever go up.
--   * Concurrent inserts for the same user queue on the counter row, so two
--     items can never receive the same number; UNIQUE (user_id, number) backs
--     this up.
--   * A failed insert rolls its counter increment back with it, so failures
--     don't burn numbers.
--   * Existing rows are numbered once, oldest first (created_at, then id).
--     Primary keys, relationships and all other values are untouched.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.number_counters (
  user_id    UUID    NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('item', 'outfit')),
  last_value INTEGER NOT NULL CHECK (last_value >= 0),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE private.number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.number_counters FROM PUBLIC, anon, authenticated;

ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS item_number INTEGER CHECK (item_number IS NULL OR item_number > 0);
ALTER TABLE public.saved_outfits
  ADD COLUMN IF NOT EXISTS outfit_number INTEGER CHECK (outfit_number IS NULL OR outfit_number > 0);

-- ── Number existing rows (only those without a number), oldest first ───────

WITH base AS (
  SELECT user_id, coalesce(max(item_number), 0) AS last FROM public.wardrobe_items GROUP BY user_id
), todo AS (
  SELECT w.id, b.last + row_number() OVER (PARTITION BY w.user_id ORDER BY w.created_at, w.id) AS n
  FROM public.wardrobe_items w JOIN base b ON b.user_id = w.user_id
  WHERE w.item_number IS NULL
)
UPDATE public.wardrobe_items w SET item_number = todo.n FROM todo WHERE w.id = todo.id;

WITH base AS (
  SELECT user_id, coalesce(max(outfit_number), 0) AS last FROM public.saved_outfits GROUP BY user_id
), todo AS (
  SELECT o.id, b.last + row_number() OVER (PARTITION BY o.user_id ORDER BY o.created_at, o.id) AS n
  FROM public.saved_outfits o JOIN base b ON b.user_id = o.user_id
  WHERE o.outfit_number IS NULL
)
UPDATE public.saved_outfits o SET outfit_number = todo.n FROM todo WHERE o.id = todo.id;

-- Counters continue after the highest number already used (never lowered)
INSERT INTO private.number_counters (user_id, kind, last_value)
SELECT user_id, 'item', max(item_number) FROM public.wardrobe_items GROUP BY user_id
ON CONFLICT (user_id, kind) DO UPDATE
  SET last_value = greatest(private.number_counters.last_value, excluded.last_value);

INSERT INTO private.number_counters (user_id, kind, last_value)
SELECT user_id, 'outfit', max(outfit_number) FROM public.saved_outfits GROUP BY user_id
ON CONFLICT (user_id, kind) DO UPDATE
  SET last_value = greatest(private.number_counters.last_value, excluded.last_value);

ALTER TABLE public.wardrobe_items ALTER COLUMN item_number SET NOT NULL;
ALTER TABLE public.saved_outfits ALTER COLUMN outfit_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wardrobe_items_user_item_number_key
  ON public.wardrobe_items (user_id, item_number);
CREATE UNIQUE INDEX IF NOT EXISTS saved_outfits_user_outfit_number_key
  ON public.saved_outfits (user_id, outfit_number);

-- ── Assignment ──────────────────────────────────────────────────────────────

-- Next number for a user: the counter row's lock serialises concurrent calls
CREATE OR REPLACE FUNCTION private.next_number(p_user UUID, p_kind TEXT)
RETURNS INTEGER
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
  INSERT INTO private.number_counters AS c (user_id, kind, last_value)
  VALUES (p_user, p_kind, 1)
  ON CONFLICT (user_id, kind) DO UPDATE SET last_value = c.last_value + 1
  RETURNING c.last_value;
$$;

CREATE OR REPLACE FUNCTION private.assign_item_number()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.item_number := private.next_number(NEW.user_id, 'item'); -- client value ignored
  ELSIF OLD.item_number IS NOT NULL THEN
    NEW.item_number := OLD.item_number;                          -- never changes
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.assign_outfit_number()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.outfit_number := private.next_number(NEW.user_id, 'outfit');
  ELSIF OLD.outfit_number IS NOT NULL THEN
    NEW.outfit_number := OLD.outfit_number;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.next_number(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_item_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_outfit_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wardrobe_items_item_number ON public.wardrobe_items;
CREATE TRIGGER wardrobe_items_item_number
  BEFORE INSERT OR UPDATE ON public.wardrobe_items
  FOR EACH ROW EXECUTE FUNCTION private.assign_item_number();

DROP TRIGGER IF EXISTS saved_outfits_outfit_number ON public.saved_outfits;
CREATE TRIGGER saved_outfits_outfit_number
  BEFORE INSERT OR UPDATE ON public.saved_outfits
  FOR EACH ROW EXECUTE FUNCTION private.assign_outfit_number();
