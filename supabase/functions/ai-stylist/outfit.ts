// Outfit planning for the AI Stylist: the wardrobe catalogue sent to Gemini,
// the structured response schema, and validation of what comes back.

import { type GarmentCategory, getNormalizedCategory } from "../_shared/category.ts";
import { normalizeAesthetic } from "../_shared/taxonomy.ts";

export interface StylistItemRow {
  id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  style_branch?: string | null;
  /** Exists after migration 008 */
  design_tradition?: string | null;
  color?: string | null;
  material?: string | null;
  pattern?: string | null;
  occasion?: string | null;
  style?: string | null;
  notes?: string | null;
}

/** The role a piece plays in an outfit, derived from its real category */
export type Slot =
  | "dress"
  | "top"
  | "bottom"
  | "layer"
  | "footwear"
  | "bag"
  | "jewellery"
  | "accessory"
  | "other";

const SLOT_BY_CATEGORY: Record<GarmentCategory, Slot> = {
  dresses: "dress",
  tops: "top",
  bottoms: "bottom",
  outerwear: "layer",
  footwear: "footwear",
  bags: "bag",
  jewellery: "jewellery",
  accessories: "accessory",
  other: "other",
};

/** Display order, and how many of each a single look may contain */
export const SLOT_ORDER: Slot[] = ["dress", "top", "bottom", "layer", "footwear", "bag", "jewellery", "accessory", "other"];
const SLOT_LIMITS: Record<Slot, number> = {
  dress: 1,
  top: 1,
  bottom: 1,
  layer: 1,
  footwear: 1,
  bag: 1,
  jewellery: 3,
  accessory: 2,
  other: 1,
};
const MAIN_SLOTS = new Set<Slot>(["dress", "top", "bottom"]);
const MISSING_SLOTS = ["top", "bottom", "layer", "footwear", "bag", "jewellery", "accessory"];

export const MAX_LOOKS = 3;

export function slotOf(item: StylistItemRow): Slot {
  return SLOT_BY_CATEGORY[getNormalizedCategory({
    category: item.category,
    subcategory: item.subcategory ?? undefined,
    name: item.name,
  })];
}

/** Wardrobe grouped by slot, with only the fields that matter for styling */
export function buildCatalog(items: StylistItemRow[]) {
  const groups: Partial<Record<Slot, Record<string, string>[]>> = {};
  for (const item of items) {
    const entry: Record<string, string> = { id: item.id, name: item.name };
    const fields: [string, string | null | undefined][] = [
      ["type", item.subcategory],
      // Traditional / Western / Indo-Western; "Unknown" is left out
      ["aesthetic", normalizeAesthetic(item.style_branch)],
      ["design_tradition", item.design_tradition],
      ["color", item.color],
      ["material", item.material],
      ["pattern", item.pattern],
      ["occasion", item.occasion],
      ["style", item.style],
      ["notes", item.notes?.slice(0, 120)],
    ];
    for (const [key, value] of fields) {
      if (value && value.trim()) entry[key] = value.trim();
    }
    (groups[slotOf(item)] ??= []).push(entry);
  }
  const ordered: Record<string, Record<string, string>[]> = {};
  for (const slot of SLOT_ORDER) if (groups[slot]) ordered[slot] = groups[slot]!;
  const empty = SLOT_ORDER.filter((s) => s !== "other" && !groups[s]);
  return { groups: ordered, emptySlots: empty };
}

export function buildPrompt(
  request: { prompt: string; occasion: string; stylePreference: string },
  items: StylistItemRow[]
): string {
  const { groups, emptySlots } = buildCatalog(items);
  return `You are ClosetMuse's personal stylist. You build outfits ONLY from the user's real wardrobe listed below.

USER REQUEST
- Occasion: ${request.occasion || "Not specified"}
- Style preference: ${request.stylePreference || "Not specified"}
- In their words: ${request.prompt || "None provided"}

HOW TO BUILD EACH LOOK
1. Work out the occasion, formality and cultural context from the request (for example Diwali, a wedding or a puja call for Traditional or Indo-Western dressing; brunch or college is casual).
2. Choose the main garment first: one dress/saree/lehenga/gown, OR a top with a bottom. A saree or lehenga may also take a matching top or blouse; a kurta may take a bottom.
3. Then go through EVERY candidate in each remaining group (layer, footwear, bag, jewellery, accessory) and compare them before choosing. Pick the one that best matches the main garment's formality, tradition, colour and material — not the first one listed.
4. Cultural fit matters. With traditional Indian outfits, prefer ethnic footwear (juttis, mojaris, kolhapuris, embellished sandals) and traditional jewellery (jhumkas, statement or temple necklaces, bangles). Use Western heels or sneakers only if nothing better exists AND they still suit the look; otherwise leave footwear out.
5. Festive and formal looks usually deserve jewellery and a bag when suitable ones exist — consider statement necklaces and decorative, embroidered or floral bags (a colourful embroidered tote or clutch can suit a daytime family celebration), not only the smallest pieces. Casual looks can be lighter. Never add a piece just to fill a slot.
6. Colours should harmonise (complementary, tonal, or metallics with jewel tones). Avoid clashing formality (e.g. sneakers with a silk saree) and repeating similar pieces.
7. If a group has nothing suitable, leave it out and add an entry to "missing". When that group does contain items, the note must name the ones you considered and say briefly why they don't suit; then suggest what would complete the look.
${emptySlots.length ? `   The wardrobe has NO items in: ${emptySlots.join(", ")}.\n` : ""}
OUTPUT RULES
- Use only ids that appear in the wardrobe below. Never invent items.
- Never use the same item twice in one look.
- Return up to ${MAX_LOOKS} looks: the best first, then alternatives that differ meaningfully from it. An alternative may reuse a piece from the main look when it is still the best choice for that role.
- For every piece, give a one-sentence reason specific to this outfit (colour, fabric, formality or tradition).
- styling_notes: 2–3 sentences on how to wear the look as a whole.

WARDROBE (grouped by role)
${JSON.stringify(groups, null, 1)}
`;
}

export const STYLIST_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    looks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          styling_notes: { type: "STRING" },
          pieces: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "STRING" },
                reason: { type: "STRING" },
              },
              required: ["id", "reason"],
            },
          },
          missing: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                slot: { type: "STRING", enum: MISSING_SLOTS },
                note: { type: "STRING" },
              },
              required: ["slot", "note"],
            },
          },
        },
        required: ["title", "styling_notes", "pieces"],
      },
    },
  },
  required: ["looks"],
};

export interface LookPiece {
  id: string;
  slot: Slot;
  reason: string;
}

export interface Look {
  title: string;
  styling_notes: string;
  pieces: LookPiece[];
  missing: { slot: string; note: string }[];
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Validates the model's looks against the real wardrobe:
 * - unknown ids and repeats are dropped; each piece's slot comes from the
 *   item's own category, not from the model
 * - per-slot limits are enforced (first choice wins)
 * - a look without a main garment, or identical to an earlier look, is dropped
 */
export function normalizeLooks(raw: unknown, items: StylistItemRow[]): Look[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rawLooks = (raw as { looks?: unknown })?.looks;
  if (!Array.isArray(rawLooks)) return [];

  const looks: Look[] = [];
  const seenSets = new Set<string>();

  for (const rawLook of rawLooks) {
    if (looks.length >= MAX_LOOKS) break;
    const r = (rawLook ?? {}) as { title?: unknown; styling_notes?: unknown; pieces?: unknown; missing?: unknown };

    const used = new Set<string>();
    const counts: Partial<Record<Slot, number>> = {};
    const pieces: LookPiece[] = [];
    for (const p of Array.isArray(r.pieces) ? r.pieces : []) {
      const id = typeof p?.id === "string" ? p.id : "";
      const item = byId.get(id);
      if (!item || used.has(id)) continue;
      const slot = slotOf(item);
      if ((counts[slot] ?? 0) >= SLOT_LIMITS[slot]) continue;
      used.add(id);
      counts[slot] = (counts[slot] ?? 0) + 1;
      pieces.push({ id, slot, reason: text(p.reason, 240) });
    }

    if (!pieces.some((p) => MAIN_SLOTS.has(p.slot))) continue;

    const key = pieces.map((p) => p.id).sort().join(",");
    if (seenSets.has(key)) continue;
    seenSets.add(key);

    pieces.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    const filled = new Set<string>(pieces.map((p) => p.slot));
    const missing = (Array.isArray(r.missing) ? r.missing : [])
      .map((m) => ({ slot: text(m?.slot, 20), note: text(m?.note, 200) }))
      .filter((m) => MISSING_SLOTS.includes(m.slot) && m.note && !filled.has(m.slot));

    looks.push({
      title: text(r.title, 80) || (looks.length === 0 ? "Your look" : `Alternative ${looks.length}`),
      styling_notes: text(r.styling_notes, 800),
      pieces,
      missing,
    });
  }

  return looks;
}
