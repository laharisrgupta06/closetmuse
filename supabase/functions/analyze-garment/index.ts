// Supabase Edge Function: analyze-garment
// Deno runtime
//
// Analyses one clothing photo with Gemini and returns structured metadata.
// Requires a signed-in user; the Gemini key stays in the GEMINI_API_KEY secret.
//
// Request:  POST { image: <base64 without data: prefix>, mimeType: "image/jpeg" }
// Response: 200 { analysis: GarmentAnalysis, model }
//           4xx/5xx { error, code? }

import { authenticate } from "../_shared/auth.ts";
import { generateJson, GeminiError } from "../_shared/gemini.ts";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import {
  ALLOWED_MIME_TYPES,
  ANALYSIS_MODELS,
  ANALYSIS_PROMPT,
  ANALYSIS_SCHEMA,
  base64ByteLength,
  InvalidAnalysisError,
  MAX_IMAGE_BYTES,
  normalizeAnalysis,
} from "./analysis.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const auth = await authenticate(req);
    if (auth.response) return auth.response;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return jsonResponse(
        { error: "GEMINI_API_KEY is not configured in Supabase Edge Function secrets.", code: "config" },
        500
      );
    }

    const body = await req.json().catch(() => null);
    const image = typeof body?.image === "string" ? body.image.replace(/\s/g, "") : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType.toLowerCase() : "";

    if (!image || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      return jsonResponse({ error: "No valid image data was provided.", code: "invalid_image" }, 400);
    }
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return jsonResponse(
        { error: `Unsupported image type "${mimeType || "unknown"}". Use JPG, PNG, WebP or HEIC.`, code: "invalid_image" },
        400
      );
    }
    if (base64ByteLength(image) > MAX_IMAGE_BYTES) {
      return jsonResponse({ error: "Image is too large to analyse (max 7 MB).", code: "invalid_image" }, 413);
    }

    const { data, model } = await generateJson({
      apiKey,
      models: ANALYSIS_MODELS,
      parts: [{ text: ANALYSIS_PROMPT }, { inlineData: { mimeType, data: image } }],
      generationConfig: { responseSchema: ANALYSIS_SCHEMA, temperature: 0.2 },
    });

    const analysis = normalizeAnalysis(data);
    return jsonResponse({ analysis, model });
  } catch (error) {
    if (error instanceof GeminiError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    if (error instanceof InvalidAnalysisError) {
      return jsonResponse({ error: error.message, code: "invalid_response" }, 422);
    }
    console.error("analyze-garment unexpected error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
