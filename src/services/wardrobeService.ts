/**
 * wardrobeService.ts
 * Handles Supabase Storage image uploads and wardrobe_items CRUD.
 * All data operations are scoped to the authenticated user.
 */
import { supabase } from "../lib/supabase";
import type { WardrobeItem, GarmentCategory, GarmentOccasion, GarmentStyle } from "../types";

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
  is_shared?: boolean;
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
  imageUrl?: string
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

  const { data, error } = await supabase
    .from("wardrobe_items")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw new Error(`Database insert failed: ${error.message}`);
  return data as WardrobeItem;
}

/**
 * Updates an existing wardrobe item's metadata and returns the updated row.
 */
export async function updateWardrobeItem(
  id: string,
  updates: Partial<NewWardrobeItem>
): Promise<WardrobeItem> {
  const userId = await getUserId();
  const payload: Record<string, unknown> = {};

  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.style_branch !== undefined) payload.style_branch = updates.style_branch;
  if (updates.subcategory !== undefined) payload.subcategory = updates.subcategory;
  if (updates.color !== undefined) payload.color = updates.color;
  if (updates.material !== undefined) payload.material = updates.material;
  if (updates.pattern !== undefined) payload.pattern = updates.pattern;
  if (updates.occasion !== undefined) payload.occasion = updates.occasion;
  if (updates.style !== undefined) payload.style = updates.style;
  if (updates.brand !== undefined) payload.brand = updates.brand;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.is_shared !== undefined) payload.is_shared = updates.is_shared;

  const { data, error } = await supabase
    .from("wardrobe_items")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

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
    .select("id, image_url");

  if (error) throw new Error(`Database delete failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      "This item could not be deleted. It may already have been removed, or it belongs to another account."
    );
  }

  // Best-effort image cleanup: the item itself is already gone
  const path = storagePathFromUrl(data[0].image_url ?? imageUrl);
  if (path) {
    const { data: removed, error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([path]);
    if (storageError || !removed?.length) {
      console.warn(
        `Image "${path}" was not removed from storage (non-fatal):`,
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
