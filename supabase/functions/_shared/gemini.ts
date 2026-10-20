// Shared Gemini client for ClosetMuse Edge Functions.
//
// The API key only ever exists here, server-side (GEMINI_API_KEY secret).
// Each call walks a model fallback chain, retrying transient errors once
// per model, and reports a single classified error if every model fails.

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface GenerateJsonOptions {
  apiKey: string;
  models: string[];
  parts: GeminiPart[];
  generationConfig: Record<string, unknown>;
}

export class GeminiError extends Error {
  /** HTTP status to return to the client */
  status: number;
  /** Machine-readable reason: "rate_limited" | "bad_request" | "config" | "unavailable" */
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.code = code;
  }
}

const RETRY_DELAY_MS = 1500;

/**
 * Calls generateContent with responseMimeType "application/json" and returns
 * the parsed JSON from the first model that answers with valid JSON.
 */
export async function generateJson({
  apiKey,
  models,
  parts,
  generationConfig,
}: GenerateJsonOptions): Promise<{ data: unknown; model: string }> {
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseMimeType: "application/json", ...generationConfig },
  });

  const failures: { model: string; status: number }[] = [];

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let res: Response;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body,
          }
        );
      } catch (err) {
        console.warn(`Gemini ${model} network error:`, err);
        failures.push({ model, status: 0 });
        break;
      }

      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text !== "string" || !text.trim()) {
          console.warn(`Gemini ${model} returned no content`);
          failures.push({ model, status: 502 });
          break;
        }
        try {
          return { data: JSON.parse(text), model };
        } catch {
          console.warn(`Gemini ${model} returned invalid JSON`);
          failures.push({ model, status: 502 });
          break;
        }
      }

      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.warn(`Gemini ${model} → HTTP ${res.status}: ${detail}`);

      const transient = res.status === 429 || res.status === 500 || res.status === 503;
      if (transient && attempt < 2) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      // Bad key or forbidden: every model will fail the same way.
      // Google reports an invalid key as 400 API_KEY_INVALID.
      if (
        res.status === 401 ||
        res.status === 403 ||
        /API_KEY_INVALID|API key not valid/i.test(detail)
      ) {
        throw new GeminiError(
          "The AI service rejected the server's API key. Check the GEMINI_API_KEY secret.",
          500,
          "config"
        );
      }

      // The request itself is invalid (e.g. an unreadable image)
      if (res.status === 400) {
        throw new GeminiError(
          "The AI service could not process this request. Try a different image.",
          400,
          "bad_request"
        );
      }

      failures.push({ model, status: res.status });
      break;
    }
  }

  if (failures.length > 0 && failures.every((f) => f.status === 429 || f.status === 503)) {
    throw new GeminiError(
      "The AI service is busy or its quota is exhausted. Please try again in a minute.",
      503,
      "rate_limited"
    );
  }

  throw new GeminiError(
    `The AI service is unavailable (${failures.map((f) => `${f.model}: ${f.status || "network"}`).join(", ")}).`,
    502,
    "unavailable"
  );
}
