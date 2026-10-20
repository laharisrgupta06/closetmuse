// Supabase Edge Function: ai-stylist
// Deno runtime
//
// Requires a signed-in user. The wardrobe is loaded server-side with the
// caller's own JWT (so RLS applies) and filtered to their user_id; any
// "items" sent in the request body are ignored.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Authenticate the caller before doing any work
    const token = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey =
      req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase is not configured for this function." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Authentication required." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);

    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiKey =
      Deno.env.get("GEMINI_API_KEY") || Deno.env.get("VITE_GEMINI_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "GEMINI_API_KEY is not configured in Supabase Edge Function secrets.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: StylistRequestBody = await req.json();
    const { prompt = "", occasion = "", style_preference = "" } = body;

    // Load only the authenticated user's wardrobe (RLS + explicit filter)
    const { data: wardrobeRows, error: wardrobeError } = await supabase
      .from("wardrobe_items")
      .select("id, name, category, color, material, pattern, occasion, style, brand, notes")
      .eq("user_id", userData.user.id);

    if (wardrobeError) {
      console.error("Failed to load wardrobe:", wardrobeError.message);
      return new Response(
        JSON.stringify({ error: "Failed to load your wardrobe." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const items: WardrobeItem[] = wardrobeRows ?? [];

    // Gracefully handle empty wardrobe
    if (items.length === 0) {
      return new Response(
        JSON.stringify({
          outfit_items: [],
          styling_notes:
            "Your wardrobe is currently empty. Please add some clothes to your closet first so the AI Stylist can assemble a look for you!",
          alternative_looks: [],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
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

    // Gemini model fallback chain — tries each model until one succeeds.
    // This gracefully handles per-model daily quota exhaustion (429).
    const STYLIST_MODELS = [
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash-lite",
      "gemini-flash-lite-latest",
    ];

    const geminiRequestBody = JSON.stringify({
      contents: [{ parts: [{ text: systemPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
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
        },
      },
    });

    let geminiResponse: Response | null = null;
    let lastModelError = "";

    for (const model of STYLIST_MODELS) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      let attempts = 0;
      const maxAttempts = 2; // 1 retry on 503 per model before moving to next

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const res = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: geminiRequestBody,
          });

          if (res.ok) {
            geminiResponse = res;
            break;
          }

          const isTransient = res.status === 503 || res.status === 429;
          if (isTransient && attempts < maxAttempts) {
            console.warn(`Model ${model} returned ${res.status}, retrying…`);
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }

          lastModelError = `${model} → HTTP ${res.status}`;
          break;
        } catch (fetchErr) {
          lastModelError = `${model} → fetch error: ${fetchErr}`;
          break;
        }
      }

      if (geminiResponse) break; // success — stop trying models
    }

    if (!geminiResponse || !geminiResponse.ok) {
      console.error("All Gemini models failed. Last error:", lastModelError);
      return new Response(
        JSON.stringify({
          error: `Gemini API unavailable across all models. Last error: ${lastModelError}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiData = await geminiResponse.json();
    const candidateText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return new Response(
        JSON.stringify({ error: "Gemini did not return any outfit response." }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(candidateText);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse Gemini response as JSON." }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // STRICT SANITIZATION: Verify that every returned item ID actually exists in the provided wardrobe
    const sanitizedOutfitItems = Array.isArray(parsedResult.outfit_items)
      ? parsedResult.outfit_items.filter((id: string) => validItemIds.has(id))
      : [];

    const sanitizedAlternatives = Array.isArray(parsedResult.alternative_looks)
      ? parsedResult.alternative_looks.map((look: string[]) =>
          Array.isArray(look) ? look.filter((id) => validItemIds.has(id)) : []
        )
      : [];

    return new Response(
      JSON.stringify({
        outfit_items: sanitizedOutfitItems,
        styling_notes:
          parsedResult.styling_notes || "Here is your styled outfit.",
        alternative_looks: sanitizedAlternatives,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge function unexpected error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
