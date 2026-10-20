/**
 * stylistService.ts
 * Handles AI Stylist requests.
 *
 * Recommendations come from the 'ai-stylist' Edge Function, which loads the
 * signed-in user's wardrobe server-side and keeps the Gemini key private.
 */
import { supabase } from "../lib/supabase";
import { invokeFunction } from "./edgeFunctions";
import { getUserId } from "./wardrobeService";
import type { WardrobeItem, GarmentOccasion, GarmentStyle } from "../types";

export interface StylingRequestParams {
  prompt: string;
  occasion?: GarmentOccasion | "";
  stylePreference?: GarmentStyle | "";
  wardrobeSource: "my_closet" | "room";
}

export interface StylistLookPiece {
  item: WardrobeItem;
  /** Role in the outfit, e.g. "dress", "footwear", "jewellery" */
  slot: string;
  /** Why this piece works with the outfit */
  reason: string;
}

export interface StylistLook {
  title: string;
  stylingNotes: string;
  pieces: StylistLookPiece[];
  /** Roles left empty on purpose, with what would complete the look */
  missing: { slot: string; note: string }[];
}

export interface StylingResultData {
  outfitItems: WardrobeItem[];
  stylingNotes: string;
  alternativeLooks: WardrobeItem[][];
  /** Main look first, then alternatives; empty when the server is an older version */
  looks: StylistLook[];
}

/**
 * Fetch the signed-in user's wardrobe items for styling.
 */
export async function fetchWardrobeItems(): Promise<WardrobeItem[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching wardrobe items:", error);
    throw new Error(`Failed to load wardrobe items: ${error.message}`);
  }

  return (data as WardrobeItem[]) || [];
}

interface StylistResponse {
  outfit_items?: string[];
  styling_notes?: string;
  alternative_looks?: string[][];
  looks?: {
    title?: string;
    styling_notes?: string;
    pieces?: { id: string; slot?: string; reason?: string }[];
    missing?: { slot: string; note: string }[];
  }[];
}

/**
 * Send a styling request to the Supabase Edge Function 'ai-stylist' and map
 * the returned item IDs back onto the user's wardrobe items.
 */
export async function requestStylistRecommendation(
  params: StylingRequestParams,
  availableItems: WardrobeItem[]
): Promise<StylingResultData> {
  if (availableItems.length === 0) {
    return {
      outfitItems: [],
      stylingNotes:
        "Your wardrobe is currently empty. Please add items to your closet first so the AI Stylist has pieces to select from!",
      alternativeLooks: [],
      looks: [],
    };
  }

  const data = await invokeFunction<StylistResponse>("ai-stylist", {
    prompt: params.prompt.trim(),
    occasion: params.occasion || undefined,
    style_preference: params.stylePreference || undefined,
    wardrobe_source: params.wardrobeSource,
    // Ignored by the updated ai-stylist, which loads the wardrobe itself.
    // Kept until that version is deployed so the current one keeps working.
    items: availableItems.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      color: item.color,
      material: item.material,
      pattern: item.pattern,
      occasion: item.occasion,
      style: item.style,
      brand: item.brand,
      notes: item.notes,
    })),
  });

  if (!data) throw new Error("No data received from AI Stylist service.");

  const itemMap = new Map<string, WardrobeItem>();
  for (const item of availableItems) itemMap.set(item.id, item);

  const toItems = (ids: unknown): WardrobeItem[] =>
    Array.isArray(ids)
      ? ids
          .map((id) => itemMap.get(String(id)))
          .filter((item): item is WardrobeItem => Boolean(item))
      : [];

  // Structured looks (current server); ids are mapped onto the user's own items
  const looks: StylistLook[] = (Array.isArray(data.looks) ? data.looks : [])
    .map((look) => ({
      title: look.title || "Your look",
      stylingNotes: look.styling_notes || "",
      pieces: (look.pieces ?? [])
        .map((p) => ({ item: itemMap.get(p.id), slot: p.slot ?? "", reason: p.reason ?? "" }))
        .filter((p): p is StylistLookPiece => Boolean(p.item)),
      missing: Array.isArray(look.missing) ? look.missing : [],
    }))
    .filter((look) => look.pieces.length > 0);

  if (looks.length > 0) {
    const [main, ...alternatives] = looks;
    return {
      outfitItems: main.pieces.map((p) => p.item),
      stylingNotes: main.stylingNotes || "Here is your curated outfit.",
      alternativeLooks: alternatives.map((l) => l.pieces.map((p) => p.item)),
      looks,
    };
  }

  return {
    outfitItems: toItems(data.outfit_items),
    stylingNotes: data.styling_notes || "Here is your curated outfit.",
    alternativeLooks: Array.isArray(data.alternative_looks)
      ? data.alternative_looks.map(toItems)
      : [],
    looks: [],
  };
}
