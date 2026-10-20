// Prompt, response schema and response validation for garment analysis.
// The output shape matches GarmentAnalysis in src/services/geminiService.ts.

export const ANALYSIS_MODELS = [
  "gemini-3.5-flash-lite", // pinned: fastest and fully accurate in testing
  "gemini-flash-lite-latest", // alias: survives future model retirements
  "gemini-3.1-flash-lite",
];

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** Max decoded image size accepted (bytes) */
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

const STYLE_BRANCHES = ["Traditional", "Indo-Western", "Western", "Unknown"];
const MAJOR_CATEGORIES = ["Clothing", "Footwear", "Bags", "Jewellery", "Accessories", "Other"];
const OCCASIONS = ["everyday", "work", "casual", "formal", "evening", "occasion", "active", "beach", "travel"];
const STYLES = ["classic", "minimalist", "bohemian", "preppy", "streetwear", "romantic", "edgy", "sophisticated", "eclectic"];

export const ANALYSIS_PROMPT = `You are a fashion cataloguing assistant specialising in Traditional, Indo-Western, and Western clothing and accessories.
Analyse the main clothing/fashion item in this image and respond ONLY with JSON matching the response schema.

Rules:
- If several different items are visible, describe the single most prominent one. Treat a matching pair (shoes, earrings, socks) as one item.
- major_category must be accurate: All bags (handbags, hobo bags, totes, clutches, crossbody, backpacks, slings) MUST be "Bags", NEVER "Accessories". All earrings, necklaces, bangles, bracelets, rings, chains, chokers MUST be "Jewellery", NEVER "Accessories". Footwear (shoes, sneakers, heels, boots, flats, sandals, loafers) MUST be "Footwear".
- style_branch must accurately distinguish Traditional (e.g. Saree, Kurta, Lehenga, Sherwani), Indo-Western (e.g. Kurti with jeans, fusion cape sets, modern dhoti drape), or Western (e.g. Jeans, T-shirt, Blazer, Cocktail dress).
- subcategory must be a specific garment/item type (e.g. "Saree", "Kurti", "Jeans", "Blazer", "Sneakers", "Jhumkas", "Handbag", "Hobo Bag").
- box_2d is the tight bounding box of that whole item (or pair) as integers from 0 to 1000: [ymin, xmin, ymax, xmax].
- Use "" for text fields you cannot determine. Use 0.5 for uncertain confidence.`;

export const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    style_branch: { type: "STRING", enum: STYLE_BRANCHES },
    major_category: { type: "STRING", enum: MAJOR_CATEGORIES },
    subcategory: { type: "STRING" },
    suggested_name: { type: "STRING" },
    color: { type: "STRING" },
    material: { type: "STRING" },
    pattern: { type: "STRING" },
    occasion: { type: "STRING", enum: OCCASIONS },
    style: { type: "STRING", enum: STYLES },
    box_2d: { type: "ARRAY", items: { type: "INTEGER" } },
    confidence: { type: "NUMBER" },
  },
  required: ["style_branch", "major_category", "subcategory", "suggested_name", "color", "confidence"],
};

export interface GarmentAnalysis {
  style_branch: string;
  major_category: string;
  subcategory: string;
  suggested_name: string;
  color: string;
  material: string;
  pattern: string;
  occasion: string;
  style: string;
  box_2d?: [number, number, number, number];
  confidence: number;
}

export class InvalidAnalysisError extends Error {}

function text(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function oneOf(value: unknown, allowed: string[], fallback: string): string {
  if (typeof value !== "string") return fallback;
  const match = allowed.find((a) => a.toLowerCase() === value.trim().toLowerCase());
  return match ?? fallback;
}

function box(value: unknown): [number, number, number, number] | undefined {
  // Some models wrap the box in an extra array: [[ymin, xmin, ymax, xmax]]
  const raw = Array.isArray(value) && value.length === 1 && Array.isArray(value[0]) ? value[0] : value;
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;
  const nums = raw.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 1000)) return undefined;
  const [ymin, xmin, ymax, xmax] = nums.map(Math.round);
  if (ymin >= ymax || xmin >= xmax) return undefined;
  return [ymin, xmin, ymax, xmax];
}

/**
 * Validates and normalises the model's JSON. Unknown enum values become
 * empty/neutral values; nothing is invented. Throws if the response does not
 * describe an item at all.
 */
export function normalizeAnalysis(raw: unknown): GarmentAnalysis {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidAnalysisError("The AI response was not an object.");
  }
  const r = raw as Record<string, unknown>;

  const analysis: GarmentAnalysis = {
    style_branch: oneOf(r.style_branch, STYLE_BRANCHES, "Unknown"),
    major_category: oneOf(r.major_category, MAJOR_CATEGORIES, "Other"),
    subcategory: text(r.subcategory),
    suggested_name: text(r.suggested_name),
    color: text(r.color),
    material: text(r.material),
    pattern: text(r.pattern),
    occasion: oneOf(r.occasion, OCCASIONS, ""),
    style: oneOf(r.style, STYLES, ""),
    confidence: Math.min(1, Math.max(0, Number.isFinite(Number(r.confidence)) ? Number(r.confidence) : 0.5)),
  };

  const b = box(r.box_2d);
  if (b) analysis.box_2d = b;

  if (!analysis.subcategory && !analysis.suggested_name && analysis.major_category === "Other") {
    throw new InvalidAnalysisError("The AI could not identify a clothing item in this image.");
  }

  return analysis;
}

/** Decoded size of a base64 string, without decoding it */
export function base64ByteLength(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}
