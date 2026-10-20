/**
 * stylistService.ts
 * Handles AI Stylist requests.
 *
 * Primary: Supabase Edge Function 'ai-stylist'
 * Fallback: Direct Gemini API call from the browser (when edge function is
 *           unavailable or its quota is exhausted).
 */
import { supabase } from "../lib/supabase";
import { getUserId } from "./wardrobeService";
import type { WardrobeItem, GarmentOccasion, GarmentStyle } from "../types";

export interface StylingRequestParams {
  prompt: string;
  occasion?: GarmentOccasion | "";
  stylePreference?: GarmentStyle | "";
  wardrobeSource: "my_closet" | "room";
}

export interface StylingResultData {
  outfitItems: WardrobeItem[];
  stylingNotes: string;
  alternativeLooks: WardrobeItem[][];
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

// Client-side model fallback chain — used when edge function is unavailable.
const STYLIST_CLIENT_MODELS = [
  "gemini-2.5-flash",   // Best reasoning for outfit curation
  "gemini-2.0-flash",   // Fast multimodal fallback
  "gemini-1.5-flash",   // Final fallback
];

/**
 * Direct browser-side Gemini call — used as fallback when Edge Function fails.
 */
async function callGeminiDirectly(
  systemPrompt: string,
  availableItems: WardrobeItem[]
): Promise<StylingResultData> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string;
  if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is not set.");

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: systemPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
    },
  });

  const itemMap = new Map<string, WardrobeItem>(availableItems.map((it) => [it.id, it]));
  const validIds = new Set(availableItems.map((it) => it.id));
  let lastError: Error | null = null;

  for (const model of STYLIST_CLIENT_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      if (!res.ok) {
        const txt = await res.text();
        lastError = new Error(`${model}: HTTP ${res.status}`);
        console.warn(`Stylist client fallback ${model} failed:`, txt.slice(0, 150));
        continue;
      }

      const data = await res.json();
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!text) {
        lastError = new Error(`${model}: empty response`);
        continue;
      }

      const parsed = JSON.parse(text);

      const outfitItems: WardrobeItem[] = Array.isArray(parsed.outfit_items)
        ? (parsed.outfit_items
            .filter((id: string) => validIds.has(id))
            .map((id: string) => itemMap.get(id))
            .filter(Boolean) as WardrobeItem[])
        : [];

      const alternativeLooks: WardrobeItem[][] = Array.isArray(parsed.alternative_looks)
        ? parsed.alternative_looks.map((look: string[]) =>
            Array.isArray(look)
              ? (look
                  .filter((id) => validIds.has(id))
                  .map((id) => itemMap.get(id))
                  .filter(Boolean) as WardrobeItem[])
              : []
          )
        : [];

      return {
        outfitItems,
        stylingNotes: parsed.styling_notes || "Here is your curated outfit.",
        alternativeLooks,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Stylist client-side model ${model} threw:`, lastError.message);
    }
  }

  throw lastError ?? new Error("All Gemini models failed for client-side styling.");
}

/**
 * Build the Gemini system prompt for outfit generation.
 * Shared between the edge function call and the direct browser fallback.
 */
function buildStylistPrompt(
  params: StylingRequestParams,
  itemCatalog: object[]
): string {
  return `You are ClosetMuse's professional personal AI stylist.
Your goal is to build an outfit from the user's REAL wardrobe inventory.

CRITICAL RULES:
1. You may ONLY select items from the provided WARDROBE INVENTORY below.
2. Under no circumstances may you invent or make up items or item IDs.
3. Every ID in "outfit_items" and "alternative_looks" MUST exactly match an "id" from the WARDROBE INVENTORY.
4. Compose a coherent, well-coordinated look suitable for the requested occasion, style, and user preferences.
5. Provide detailed styling advice in "styling_notes" explaining why these pieces work together and how to wear them.

USER REQUEST:
- Occasion: ${params.occasion || "Not specified"}
- Style Preference: ${params.stylePreference || "Not specified"}
- User Instructions: ${params.prompt.trim() || "None provided"}

WARDROBE INVENTORY (JSON):
${JSON.stringify(itemCatalog, null, 2)}

Respond ONLY with valid JSON matching this schema — no markdown fences, no extra text:
{
  "outfit_items": ["<item-id>", ...],
  "styling_notes": "<detailed advice>",
  "alternative_looks": [["<item-id>", ...], ...]
}`;
}

/**
 * Send styling request to the Supabase Edge Function 'ai-stylist'.
 * Automatically falls back to a direct Gemini API call if the edge function
 * returns an error (e.g. quota exhausted, deployment issue).
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
    };
  }

  const itemCatalog = availableItems.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    color: item.color || "unspecified",
    material: item.material || "unspecified",
    pattern: item.pattern || "unspecified",
    occasion: item.occasion || "any",
    style: item.style || "any",
  }));

  const systemPrompt = buildStylistPrompt(params, itemCatalog);

  // ── Step 1: Try Supabase Edge Function ──────────────────────────
  let edgeFunctionFailed = false;

  try {
    const { data, error } = await supabase.functions.invoke("ai-stylist", {
      body: {
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
      },
    });

    if (error) {
      // Supabase client error (network / non-2xx from edge function)
      console.warn("Edge Function invocation error, using client fallback:", error.message);
      edgeFunctionFailed = true;
    } else if (data?.error) {
      // Edge function returned an application-level error (e.g. Gemini quota)
      console.warn("Edge Function app-level error, using client fallback:", data.error);
      edgeFunctionFailed = true;
    } else if (data) {
      // ✅ Edge function succeeded
      const itemMap = new Map<string, WardrobeItem>();
      for (const item of availableItems) itemMap.set(item.id, item);

      const outfitItems: WardrobeItem[] = Array.isArray(data.outfit_items)
        ? data.outfit_items
            .map((id: string) => itemMap.get(id))
            .filter((item: WardrobeItem | undefined): item is WardrobeItem => Boolean(item))
        : [];

      const alternativeLooks: WardrobeItem[][] = Array.isArray(data.alternative_looks)
        ? data.alternative_looks.map((look: string[]) =>
            Array.isArray(look)
              ? look
                  .map((id: string) => itemMap.get(id))
                  .filter((item: WardrobeItem | undefined): item is WardrobeItem => Boolean(item))
              : []
          )
        : [];

      return {
        outfitItems,
        stylingNotes: data.styling_notes || "Here is your curated outfit.",
        alternativeLooks,
      };
    } else {
      edgeFunctionFailed = true;
    }
  } catch (invokeErr) {
    console.warn("Edge Function threw unexpectedly, using client fallback:", invokeErr);
    edgeFunctionFailed = true;
  }

  // ── Step 2: Direct Gemini fallback ──────────────────────────────
  if (edgeFunctionFailed) {
    console.info("AI Stylist: switching to client-side Gemini fallback.");
    return await callGeminiDirectly(systemPrompt, availableItems);
  }

  throw new Error("No data received from AI Stylist service.");
}
