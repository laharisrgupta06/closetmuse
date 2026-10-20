// Supabase Edge Function: ai-stylist
// Deno runtime
//
// Requires a signed-in user. The wardrobe is loaded server-side with the
// caller's own JWT (so RLS applies) and filtered to their user_id; any
// "items" sent in the request body are ignored.

import { authenticate } from "../_shared/auth.ts";
import { generateJson, GeminiError } from "../_shared/gemini.ts";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

interface WardrobeItem {
  id: string;
  name: string;
  category: string;
  color?: string;
  material?: string;
  pattern?: string;
  occasion?: string;
  style?: string;
  brand?: string;
  notes?: string;
}

interface StylistRequestBody {
  prompt?: string;
  occasion?: string;
  style_preference?: string;
  wardrobe_source?: "my_closet" | "room";
}

// Gemini model fallback chain — tries each model until one succeeds.
// This gracefully handles per-model daily quota exhaustion (429).
// gemini-3.8-flash was dropped: it took 55–78 s per request in testing,
// while gemini-3.5-flash picked the same outfit in ~5 s.
const STYLIST_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
];

const STYLIST_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    outfit_items: {
      type: "ARRAY",
      items: { type: "STRING" },
      description:
        "Array of exact item IDs selected from the wardrobe inventory for the main outfit.",
    },
    styling_notes: {
      type: "STRING",
      description:
        "Detailed advice explaining the outfit choice, color harmony, and styling tips.",
    },
    alternative_looks: {
      type: "ARRAY",
      items: { type: "ARRAY", items: { type: "STRING" } },
      description:
        "Optional alternative outfits, each being an array of exact item IDs from the wardrobe inventory.",
    },
  },
  required: ["outfit_items", "styling_notes"],
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Authenticate the caller before doing any work
    const auth = await authenticate(req);
    if (auth.response) return auth.response;
    const { supabase, user } = auth;

    const apiKey =
      Deno.env.get("GEMINI_API_KEY") || Deno.env.get("VITE_GEMINI_API_KEY");

    if (!apiKey) {
      return jsonResponse(
        {
          error:
            "GEMINI_API_KEY is not configured in Supabase Edge Function secrets.",
        },
        500
      );
    }

    const body: StylistRequestBody = await req.json();
    const { prompt = "", occasion = "", style_preference = "" } = body;

    // Load only the authenticated user's wardrobe (RLS + explicit filter)
    const { data: wardrobeRows, error: wardrobeError } = await supabase
      .from("wardrobe_items")
      .select("id, name, category, color, material, pattern, occasion, style, brand, notes")
      .eq("user_id", user.id);

    if (wardrobeError) {
      console.error("Failed to load wardrobe:", wardrobeError.message);
      return jsonResponse({ error: "Failed to load your wardrobe." }, 500);
    }

    const items: WardrobeItem[] = wardrobeRows ?? [];

    // Gracefully handle empty wardrobe
    if (items.length === 0) {
      return jsonResponse({
        outfit_items: [],
        styling_notes:
          "Your wardrobe is currently empty. Please add some clothes to your closet first so the AI Stylist can assemble a look for you!",
        alternative_looks: [],
      });
    }

    // Prepare item list for Gemini
    const itemCatalog = items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      color: item.color || "unspecified",
      material: item.material || "unspecified",
      pattern: item.pattern || "unspecified",
      occasion: item.occasion || "any",
      style: item.style || "any",
    }));

    const validItemIds = new Set(items.map((i) => i.id));

    const systemPrompt = `You are ClosetMuse's professional personal AI stylist.
Your goal is to build an outfit from the user's REAL wardrobe inventory.

CRITICAL RULES:
1. You may ONLY select items from the provided WARDROBE INVENTORY below.
2. Under no circumstances may you invent or make up items or item IDs.
3. Every ID in "outfit_items" and "alternative_looks" MUST exactly match an "id" from the WARDROBE INVENTORY.
4. Compose a coherent, well-coordinated look suitable for the requested occasion, style, and user preferences.
5. Provide detailed styling advice in "styling_notes" explaining why these pieces work together and how to wear them.

USER REQUEST:
- Occasion: ${occasion || "Not specified"}
- Style Preference: ${style_preference || "Not specified"}
- User Instructions: ${prompt || "None provided"}

WARDROBE INVENTORY (JSON):
${JSON.stringify(itemCatalog, null, 2)}
`;

    const { data: parsedResult } = await generateJson({
      apiKey,
      models: STYLIST_MODELS,
      parts: [{ text: systemPrompt }],
      generationConfig: { responseSchema: STYLIST_RESPONSE_SCHEMA },
    });

    const result = (parsedResult ?? {}) as {
      outfit_items?: unknown;
      styling_notes?: unknown;
      alternative_looks?: unknown;
    };

    // STRICT SANITIZATION: Verify that every returned item ID actually exists in the provided wardrobe
    const sanitizedOutfitItems = Array.isArray(result.outfit_items)
      ? result.outfit_items.filter((id: string) => validItemIds.has(id))
      : [];

    const sanitizedAlternatives = Array.isArray(result.alternative_looks)
      ? result.alternative_looks.map((look: string[]) =>
          Array.isArray(look) ? look.filter((id) => validItemIds.has(id)) : []
        )
      : [];

    return jsonResponse({
      outfit_items: sanitizedOutfitItems,
      styling_notes:
        (typeof result.styling_notes === "string" && result.styling_notes) ||
        "Here is your styled outfit.",
      alternative_looks: sanitizedAlternatives,
    });
  } catch (error) {
    if (error instanceof GeminiError) {
      console.error("Gemini failed for ai-stylist:", error.message);
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    console.error("Edge function unexpected error:", error);
    return jsonResponse(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      500
    );
  }
});
