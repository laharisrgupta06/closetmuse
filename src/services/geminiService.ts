/**
 * geminiService.ts
 * Calls the Gemini generateContent REST API with inline base64 image data
 * to analyse a clothing/fashion item and return structured taxonomy.
 * Includes resilience fallback to gemini-3.1-flash-lite if gemini-3.8-flash is overloaded.
 */

export interface GarmentAnalysis {
  /** "Traditional" | "Indo-Western" | "Western" | "Unknown" */
  style_branch: string;
  /** e.g. "Clothing" | "Footwear" | "Accessories" | "Jewellery" */
  major_category: string;
  /** e.g. "Saree" | "Kurti" | "Jeans" | "Sneakers" */
  subcategory: string;
  /** Human-readable name suggestion */
  suggested_name: string;
  color: string;
  material: string;
  pattern: string;
  occasion: string;
  style: string;
  /** Normalized bounding box [ymin, xmin, ymax, xmax] 0-1000 */
  box_2d?: [number, number, number, number];
  /** Array of normalized silhouette points [[ymin, xmin], ...] 0-1000 */
  polygon?: [number, number][];
  /** 0–1 confidence */
  confidence: number;
}

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;

const MODELS = [
  "gemini-2.5-flash",    // Best price-performance, strong structured output
  "gemini-2.0-flash",    // Fast, multimodal fallback
  "gemini-1.5-flash",    // Final fallback
];

const SYSTEM_PROMPT = `You are a fashion cataloguing assistant specialising in Traditional, Indo-Western, and Western clothing and accessories.
Analyse the clothing/fashion item in this image and respond ONLY with valid JSON matching this exact schema — no markdown fences, no extra text:

{
  "style_branch":    "Traditional" | "Indo-Western" | "Western" | "Unknown",
  "major_category":  "Clothing" | "Footwear" | "Bags" | "Jewellery" | "Accessories" | "Other",
  "subcategory":     string,
  "suggested_name":  string,
  "color":           string,
  "material":        string,
  "pattern":         string,
  "occasion":        "everyday" | "work" | "casual" | "formal" | "evening" | "occasion" | "active" | "beach" | "travel" | "",
  "style":           "classic" | "minimalist" | "bohemian" | "preppy" | "streetwear" | "romantic" | "edgy" | "sophisticated" | "eclectic" | "",
  "box_2d":          [ymin, xmin, ymax, xmax],
  "polygon":         [[ymin, xmin], ...],
  "confidence":      number
}

Rules:
- major_category must be accurate: All bags (handbags, hobo bags, totes, clutches, crossbody, backpacks, slings) MUST be categorized as "Bags", NEVER "Accessories". All earrings, necklaces, bangles, bracelets, rings, chains, chokers MUST be categorized as "Jewellery", NEVER "Accessories". Footwear (shoes, sneakers, heels, boots, flats, sandals, loafers) MUST be "Footwear".
- style_branch must accurately distinguish Traditional (e.g. Saree, Kurta, Lehenga, Sherwani), Indo-Western (e.g. Kurti with jeans, fusion cape sets, modern dhoti drape), or Western (e.g. Jeans, T-shirt, Blazer, Cocktail dress).
- subcategory must be a specific garment/item type (e.g. "Saree", "Kurti", "Jeans", "Blazer", "Sneakers", "Jhumkas", "Handbag", "Hobo Bag").
- box_2d should be the bounding box of the main item as normalized integer coordinates from 0 to 1000: [ymin, xmin, ymax, xmax].
- polygon must be an array of 20 to 60 boundary points [ymin, xmin] (0-1000) tracing the tight, exact perimeter contour of the garment, cleanly separating it from background bedsheets, floors, walls, or furniture.
- Use "" for fields you cannot determine. Use 0.5 for uncertain confidence.`;

export async function analyseGarmentImage(
  base64Data: string,
  mimeType: string
): Promise<GarmentAnalysis> {
  if (!GEMINI_API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY is not set in .env.local.");
  }

  const body = {
    contents: [
      {
        parts: [
          { text: SYSTEM_PROMPT },
          { inlineData: { mimeType, data: base64Data } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  };

  let lastError: Error | null = null;

  for (const model of MODELS) {
    let attempts = 0;
    const maxAttempts = 2; // retry once on 429/503 before moving to next model
    while (attempts < maxAttempts) {
      attempts++;
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text();
          const isTransient = res.status === 429 || res.status === 503;
          if (isTransient && attempts < maxAttempts) {
            // Wait 2s before retry
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          throw new Error(`Gemini API (${model}) error ${res.status}: ${errText}`);
        }

        const data = await res.json();
        const text: string =
          data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

        if (!text) throw new Error("Gemini returned an empty response.");

        return JSON.parse(text) as GarmentAnalysis;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        console.warn(`Model ${model} failed, trying fallback:`, lastError.message);
        break;
      }
    }
  }

  throw lastError ?? new Error("All Gemini models failed to analyze the image.");
}

export async function fileToBase64(
  file: File | Blob
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(",");
      const mimeType = header.split(":")[1].split(";")[0];
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
