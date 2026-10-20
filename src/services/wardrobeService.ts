/**
 * wardrobeService.ts
 * Handles Supabase Storage image uploads and wardrobe_items CRUD.
 * All data operations are scoped to the authenticated user.
 */
import { supabase } from "../lib/supabase";
import type { WardrobeItem, GarmentCategory, GarmentOccasion, GarmentStyle } from "../types";
import { missingOptionalColumn } from "../utils/itemEdits";

const BUCKET = "wardrobe-images";

export interface NewWardrobeItem {
  name: string;
  category: GarmentCategory;
  style_branch?: string;
  subcategory?: string;
  color?: string;
  material?: string;
  pattern?: string;
  occasion?: GarmentOccasion;
  style?: GarmentStyle;
  brand?: string;
  notes?: string;
  /** Needs migration 008; check hasDesignTraditionColumn() before offering it */
  design_tradition?: string;
  is_shared?: boolean;
}

/** Fields of an update; null clears a stored value */
export type WardrobeItemUpdate = { [K in keyof NewWardrobeItem]?: NewWardrobeItem[K] | null };

/**
 * Runs an insert or update, dropping an optional column the database doesn't
 * have yet (before migrations 006/008) and retrying. Required columns are
 * never dropped.
 */
async function withOptionalColumns<T>(
  row: Record<string, unknown>,
  run: (row: Record<string, unknown>) => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>
): Promise<{ data: T | null; error: { code?: string; message: string } | null }> {
  let current = { ...row };
  for (;;) {
    const result = await run(current);
    const missing = missingOptionalColumn(result.error);
    if (!missing || !(missing in current)) return result;
    if (current[missing] !== null && current[missing] !== undefined) {
      console.warn(`"${missing}" was not saved: the database column does not exist yet.`);
    }
    const { [missing]: _dropped, ...rest } = current;
    void _dropped;
    current = rest;
  }
}

let traditionColumn: Promise<boolean> | null = null;

/**
 * Whether wardrobe_items.design_tradition exists (migration 008). Checked
 * once per session with a read that returns no rows.
 */
export function hasDesignTraditionColumn(): Promise<boolean> {
  traditionColumn ??= (async () => {
    const { error } = await supabase.from("wardrobe_items").select("design_tradition").limit(0);
    if (!error) return true;
    if (missingOptionalColumn(error) === "design_tradition") return false;
    traditionColumn = null; // network or auth problem: try again next time
    return false;
  })();
  return traditionColumn;
}

/**
 * Uploads an image File or Blob to Supabase Storage and returns the public URL.
 * Files go under "<user_id>/", the only folder Storage policies let a user write to.
 */
export async function uploadGarmentImage(file: File | Blob, customName?: string): Promise<string> {
  const userId = await getUserId();
  const fileName = (file instanceof File ? file.name : customName) ?? "garment.png";
  const ext = fileName.split(".").pop() ?? "png";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "image/png",
  });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Returns the authenticated user's ID.
 * Throws if no user session is found (should never happen inside RequireAuth).
 */
export async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (data?.user?.id) return data.user.id;
  throw new Error("Not authenticated. Please sign in.");
}

/**
 * Inserts a new item into wardrobe_items and returns the created row.
 */
export async function createWardrobeItem(
  item: NewWardrobeItem,
  imageUrl?: string,
  /** The untouched upload, when imageUrl is a processed (background-removed) version */
  originalImageUrl?: string
): Promise<WardrobeItem> {
  const userId = await getUserId();
  const payload = {
    user_id: userId,
    name: item.name,
    category: item.category,
    style_branch: item.style_branch ?? null,
    subcategory: item.subcategory ?? null,
    color: item.color ?? null,
    material: item.material ?? null,
    pattern: item.pattern ?? null,
    occasion: item.occasion ?? null,
    style: item.style ?? null,
    brand: item.brand ?? null,
    notes: item.notes ?? null,
    image_url: imageUrl ?? null,
    is_favorite: false,
    is_shared: item.is_shared ?? false,
  };
  // Optional columns are only sent with a value, so saves work before 006/008
  const row: Record<string, unknown> = { ...payload };
  if (originalImageUrl) row.original_image_url = originalImageUrl;
  if (item.design_tradition?.trim()) row.design_tradition = item.design_tradition.trim();

  const { data, error } = await withOptionalColumns<WardrobeItem>(row, (r) =>
    supabase.from("wardrobe_items").insert(r).select("*").single()
  );

  if (error) throw new Error(`Database insert failed: ${error.message}`);
  return data as WardrobeItem;
}

const UPDATABLE_FIELDS = [
  "name", "category", "style_branch", "subcategory", "color", "material", "pattern",
  "occasion", "style", "brand", "notes", "design_tradition", "is_shared",
] as const;

/**
 * Updates only the given fields (null clears one) and returns the updated row.
 */
export async function updateWardrobeItem(
  id: string,
  updates: WardrobeItemUpdate
): Promise<WardrobeItem> {
  const userId = await getUserId();
  const payload: Record<string, unknown> = {};
  for (const field of UPDATABLE_FIELDS) {
    if (updates[field] !== undefined) payload[field] = updates[field];
  }

  const { data, error } = await withOptionalColumns<WardrobeItem>(payload, (row) =>
    Object.keys(row).length === 0
      ? // Nothing left to change: return the row as stored
        supabase.from("wardrobe_items").select("*").eq("id", id).eq("user_id", userId).single()
      : supabase.from("wardrobe_items").update(row).eq("id", id).eq("user_id", userId).select("*").single()
  );

  if (error) throw new Error(`Database update failed: ${error.message}`);
  return data as WardrobeItem;
}

/**
 * Returns the object path inside the wardrobe-images bucket for one of our
 * public image URLs, or null for any other URL.
 */
function storagePathFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
  return path || null;
}

/**
 * Deletes a wardrobe item by ID, then removes its image from Supabase Storage.
 * Throws if no row was deleted (already gone, or owned by someone else), so
 * the UI never drops an item that still exists.
 */
export async function deleteWardrobeItem(id: string, imageUrl?: string): Promise<void> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("wardrobe_items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("*");

  if (error) throw new Error(`Database delete failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      "This item could not be deleted. It may already have been removed, or it belongs to another account."
    );
  }

  // Best-effort image cleanup (processed image and kept original): the item itself is already gone
  const row = data[0] as { image_url?: string | null; original_image_url?: string | null };
  const paths = [...new Set([row.image_url ?? imageUrl, row.original_image_url].map(storagePathFromUrl))]
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    const { data: removed, error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
    if (storageError || (removed?.length ?? 0) < paths.length) {
      console.warn(
        `Image file(s) not removed from storage (non-fatal): ${paths.join(", ")}`,
        storageError?.message ?? "not permitted or already removed"
      );
    }
  }
}

/**
 * Fetches the current user's wardrobe items, newest first.
 */
export async function fetchAllWardrobeItems(): Promise<WardrobeItem[]> {
  const userId = await getUserId();

  // Always scoped to the signed-in user (RLS also enforces this)
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to fetch wardrobe items: ${error.message}`);
  return (data as WardrobeItem[]) ?? [];
}
