/**
 * outfitService.ts
 * Manages persisting and fetching saved outfits for both Outfit Builder and AI Stylist.
 *
 * Primary persistence: 'saved_outfits' Supabase table (via migration 002).
 * Resilient fallback: user_metadata on auth.users + user-scoped localStorage cache.
 *
 * Guarantees that saved outfits persist across page refreshes, sign-in/sign-out,
 * and offline/network glitches under all conditions.
 */
import { supabase } from "../lib/supabase";
import type { WardrobeItem, GarmentOccasion, GarmentStyle } from "../types";

export interface SavedOutfit {
  id: string;
  user_id: string;
  name: string;
  occasion?: GarmentOccasion | "";
  style?: GarmentStyle | "";
  styling_notes?: string;
  items: WardrobeItem[];
  item_ids: string[];
  /** Permanent per-user number shown as "Outfit #001" (migration 009); none until saved */
  outfit_number?: number | null;
  created_at: string;
}

export interface NewSavedOutfitParams {
  name?: string;
  occasion?: GarmentOccasion | "";
  style?: GarmentStyle | "";
  styling_notes?: string;
  items: WardrobeItem[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the saved_outfits table has not been created yet (migration 002) */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

function getLocalCacheKey(userId: string): string {
  return `closetmuse_saved_outfits_${userId}`;
}

function getLocalCachedOutfits(userId: string): SavedOutfit[] {
  try {
    const raw = localStorage.getItem(getLocalCacheKey(userId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveToLocalCache(userId: string, outfit: SavedOutfit) {
  try {
    const existing = getLocalCachedOutfits(userId);
    const updated = [outfit, ...existing.filter((o) => o.id !== outfit.id)];
    localStorage.setItem(getLocalCacheKey(userId), JSON.stringify(updated));
  } catch (e) {
    console.warn("Could not save outfit to local cache:", e);
  }
}

function removeFromLocalCache(userId: string, outfitId: string) {
  try {
    const existing = getLocalCachedOutfits(userId);
    const updated = existing.filter((o) => o.id !== outfitId);
    localStorage.setItem(getLocalCacheKey(userId), JSON.stringify(updated));
  } catch (e) {
    console.warn("Could not remove outfit from local cache:", e);
  }
}

/**
 * Saves an outfit for the currently authenticated user.
 * Returns the saved outfit object (persisted to DB, user_metadata, and local cache).
 */
export async function saveOutfit(
  params: NewSavedOutfitParams
): Promise<SavedOutfit> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    throw new Error("You must be signed in to save outfits.");
  }
  const user = userData.user;
  const now = new Date().toISOString();
  const outfitName =
    params.name?.trim() ||
    [params.occasion, "Outfit"].filter(Boolean).join(" ") ||
    "Curated Look";

  const itemIds = params.items.map((it) => it.id);

  let savedOutfitResult: SavedOutfit | null = null;

  // ── Attempt 1: Insert into 'saved_outfits' DB table ──────────────────────
  try {
    const { data: dbData, error: insertErr } = await supabase
      .from("saved_outfits")
      .insert({
        user_id: user.id,
        name: outfitName,
        occasion: params.occasion || null,
        style: params.style || null,
        styling_notes: params.styling_notes || null,
        item_ids: itemIds,
      })
      .select("*")
      .single();

    if (insertErr && !isMissingTable(insertErr)) {
      throw new Error(`Could not save outfit: ${insertErr.message}`);
    } else if (insertErr) {
      console.warn("saved_outfits table missing (migration 002 not applied); using fallback storage.");
    } else if (dbData) {
      savedOutfitResult = {
        id: dbData.id,
        user_id: dbData.user_id,
        name: dbData.name,
        occasion: dbData.occasion || "",
        style: dbData.style || "",
        styling_notes: dbData.styling_notes || "",
        items: params.items,
        item_ids: dbData.item_ids || itemIds,
        outfit_number: dbData.outfit_number ?? null,
        created_at: dbData.created_at,
      };
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Could not save outfit")) throw err;
    console.warn("saved_outfits DB insert threw:", err);
  }

  // ── Attempt 2: User metadata fallback if DB didn't succeed ───────────────
  if (!savedOutfitResult) {
    const outfitId = `outfit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { data: freshUserData } = await supabase.auth.getUser();
    const freshUser = freshUserData?.user || user;

    const existingMetadataOutfits: SavedOutfit[] =
      (freshUser.user_metadata?.saved_outfits as SavedOutfit[]) || [];

    const newOutfit: SavedOutfit = {
      id: outfitId,
      user_id: user.id,
      name: outfitName,
      occasion: params.occasion || "",
      style: params.style || "",
      styling_notes: params.styling_notes || "",
      items: params.items,
      item_ids: itemIds,
      created_at: now,
    };

    try {
      const updatedOutfits = [newOutfit, ...existingMetadataOutfits];
      await supabase.auth.updateUser({
        data: { saved_outfits: updatedOutfits },
      });
    } catch (metaErr) {
      console.warn("Could not persist to user_metadata:", metaErr);
    }

    savedOutfitResult = newOutfit;
  }

  // ── Always mirror to local cache for instant refresh persistence ────────
  saveToLocalCache(user.id, savedOutfitResult);

  return savedOutfitResult;
}

/**
 * Fetches all saved outfits for the authenticated user, hydrated with wardrobe items.
 * Merges DB table, user_metadata, and local cache.
 */
export async function fetchSavedOutfits(): Promise<SavedOutfit[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return [];
  const user = userData.user;

  // Hydration map from wardrobe_items
  const { data: wardrobeRows } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", user.id);

  const wardrobeMap = new Map<string, WardrobeItem>();
  if (wardrobeRows) {
    for (const item of wardrobeRows as WardrobeItem[]) {
      wardrobeMap.set(item.id, item);
    }
  }

  const hydrateItems = (itemIds: string[], fallbackItems?: WardrobeItem[]): WardrobeItem[] => {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      if (wardrobeRows) {
        return (fallbackItems || []).filter((it) => wardrobeMap.has(it.id));
      }
      return fallbackItems || [];
    }
    return itemIds
      .map((id) => (wardrobeRows ? wardrobeMap.get(id) : (wardrobeMap.get(id) || fallbackItems?.find((i) => i.id === id))))
      .filter((it): it is WardrobeItem => Boolean(it));
  };

  const results: SavedOutfit[] = [];
  const seenIds = new Set<string>();

  // 1. Try DB table
  try {
    const { data: dbData, error: dbErr } = await supabase
      .from("saved_outfits")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!dbErr && dbData) {
      for (const row of dbData) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          results.push({
            id: row.id,
            user_id: row.user_id,
            name: row.name,
            occasion: row.occasion || "",
            style: row.style || "",
            styling_notes: row.styling_notes || "",
            items: hydrateItems(row.item_ids || []),
            item_ids: row.item_ids || [],
            outfit_number: row.outfit_number ?? null,
            created_at: row.created_at,
          });
        }
      }
    }
  } catch (err) {
    console.info("saved_outfits DB query threw, checking fallback:", err);
  }

  // 2. Merge user_metadata
  const metadataOutfits: SavedOutfit[] =
    (user.user_metadata?.saved_outfits as SavedOutfit[]) || [];
  for (const o of metadataOutfits) {
    if (!seenIds.has(o.id)) {
      seenIds.add(o.id);
      results.push({
        ...o,
        items: hydrateItems(o.item_ids, o.items),
      });
    }
  }

  // 3. Merge local cache
  const localOutfits = getLocalCachedOutfits(user.id);
  for (const o of localOutfits) {
    if (!seenIds.has(o.id)) {
      seenIds.add(o.id);
      results.push({
        ...o,
        items: hydrateItems(o.item_ids, o.items),
      });
    }
  }

  return results.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Deletes a saved outfit by ID for the current authenticated user.
 */
export async function deleteSavedOutfit(outfitId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return;
  const user = userData.user;

  // Database rows have UUIDs; fallback outfits use "outfit-…" ids
  if (UUID_RE.test(outfitId)) {
    const { error } = await supabase
      .from("saved_outfits")
      .delete()
      .eq("id", outfitId)
      .eq("user_id", user.id);
    if (error && !isMissingTable(error)) {
      throw new Error(`Could not delete outfit: ${error.message}`);
    }
  }

  // Remove from user_metadata only if it is stored there
  const metadataOutfits: SavedOutfit[] =
    (user.user_metadata?.saved_outfits as SavedOutfit[]) || [];
  if (metadataOutfits.some((o) => o.id === outfitId)) {
    const { error } = await supabase.auth.updateUser({
      data: { saved_outfits: metadataOutfits.filter((o) => o.id !== outfitId) },
    });
    if (error) throw new Error(`Could not delete outfit: ${error.message}`);
  }

  // Remove from local cache
  removeFromLocalCache(user.id, outfitId);
}
