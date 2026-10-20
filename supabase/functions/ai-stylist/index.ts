// Supabase Edge Function: ai-stylist
// Deno runtime
//
// Requires a signed-in user. The wardrobe is loaded server-side with the
// caller's own JWT (so RLS applies) and filtered to their user_id; any
// "items" sent in the request body are ignored.
//
// Response: { looks: Look[], outfit_items, styling_notes, alternative_looks }
// "looks" carries per-piece reasons and missing-piece notes; the other three
// fields keep the original format for older clients.

import { authenticate } from "../_shared/auth.ts";
import { generateJson, GeminiError } from "../_shared/gemini.ts";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import {
  buildPrompt,
  normalizeLooks,
  STYLIST_RESPONSE_SCHEMA,
  type StylistItemRow,
} from "./outfit.ts";

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
      .select("id, name, category, subcategory, style_branch, color, material, pattern, occasion, style, notes")
      .eq("user_id", user.id);

    if (wardrobeError) {
      console.error("Failed to load wardrobe:", wardrobeError.message);
      return jsonResponse({ error: "Failed to load your wardrobe." }, 500);
    }

    const items: StylistItemRow[] = wardrobeRows ?? [];

    // Gracefully handle empty wardrobe
    if (items.length === 0) {
      return jsonResponse({
        looks: [],
        outfit_items: [],
        styling_notes:
          "Your wardrobe is currently empty. Please add some clothes to your closet first so the AI Stylist can assemble a look for you!",
        alternative_looks: [],
      });
    }

    const { data } = await generateJson({
      apiKey,
      models: STYLIST_MODELS,
      parts: [{ text: buildPrompt({ prompt, occasion, stylePreference: style_preference }, items) }],
      generationConfig: { responseSchema: STYLIST_RESPONSE_SCHEMA, temperature: 0.5 },
    });

    // Every id is checked against this user's wardrobe; roles come from the
    // items' real categories
    const looks = normalizeLooks(data, items);
    if (looks.length === 0) {
      return jsonResponse(
        {
          error:
            "The stylist couldn't put together an outfit from your wardrobe for this request. Try rephrasing it, or add more pieces to your closet.",
          code: "no_valid_look",
        },
        502
      );
    }

    const [main, ...alternatives] = looks;
    return jsonResponse({
      looks,
      outfit_items: main.pieces.map((p) => p.id),
      styling_notes: main.styling_notes || "Here is your styled outfit.",
      alternative_looks: alternatives.map((l) => l.pieces.map((p) => p.id)),
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
