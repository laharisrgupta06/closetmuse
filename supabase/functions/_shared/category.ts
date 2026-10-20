// Category normalization shared by the React app (re-exported from
// src/utils/category.ts) and the Edge Functions, so both sides agree.
// Keep this file free of app or Deno-specific imports.

import { taxonomyKeywords } from "./taxonomy.ts";

export type GarmentCategory =
  | "tops"
  | "bottoms"
  | "dresses"
  | "outerwear"
  | "footwear"
  | "accessories"
  | "bags"
  | "jewellery"
  | "other";

export const CATEGORY_DEFINITIONS: { value: GarmentCategory; label: string }[] = [
  { value: "tops", label: "Tops" },
  { value: "bottoms", label: "Bottoms" },
  { value: "dresses", label: "Dresses" },
  { value: "outerwear", label: "Outerwear" },
  { value: "footwear", label: "Footwear" },
  { value: "bags", label: "Bags" },
  { value: "jewellery", label: "Jewellery" },
  { value: "accessories", label: "Accessories" },
  { value: "other", label: "Other" },
];

// Keywords are matched as whole words, with an optional plural "s"/"es".
// Multi-word keywords are written with spaces ("one piece" matches "one-piece").

export const BAG_KEYWORDS = [
  "bag",
  "handbag",
  "hobo",
  "tote",
  "purse",
  "clutch",
  "backpack",
  "crossbody",
  "satchel",
  "pouch",
  "wallet",
  "sling",
  "duffel",
  "potli",
  "jhola",
];

export const JEWELLERY_KEYWORDS = [
  "earring",
  "necklace",
  "ring",
  "bracelet",
  "bangle",
  "choker",
  "jewel",
  "jewelry",
  "jewellery",
  "jhumka",
  "jhumki",
  "pendant",
  "brooch",
  "anklet",
  "tikka",
  "chain",
  "kada",
  "payal",
  "stud",
  "mangalsutra",
];

export const FOOTWEAR_KEYWORDS = [
  "shoe",
  "sneaker",
  "trainer",
  "boot",
  "sandal",
  "heel",
  "loafer",
  "flats",
  "mule",
  "slipper",
  "footwear",
  "oxford",
  "derby",
  "pump",
  "wedge",
  "stiletto",
  "clog",
  "mojri",
  "jutti",
  "kolhapuri",
  "chappal",
];

export const DRESS_KEYWORDS = [
  "saree",
  "sari",
  "dress",
  "gown",
  "lehenga",
  "anarkali",
  "jumpsuit",
  "romper",
  "one piece",
];

export const BOTTOM_KEYWORDS = [
  "trouser",
  "pant",
  "jeans",
  "denim",
  "shorts",
  "chino",
  "bottom",
  "legging",
  "jogger",
  "palazzo",
  "salwar",
  "churidar",
  "dhoti",
  "pyjama",
  "culottes",
  "skirt",
];

export const OUTERWEAR_KEYWORDS = [
  "jacket",
  "coat",
  "blazer",
  "outerwear",
  "cardigan",
  "sweater",
  "hoodie",
  "shrug",
  "shawl",
  "trench",
  "overcoat",
  "cape",
];

export const TOP_KEYWORDS = [
  "top",
  "shirt",
  "tshirt",
  "tee",
  "blouse",
  "kurti",
  "kurta",
  "sherwani",
  "camisole",
  "tank",
  "tunic",
  "polo",
  "sweatshirt",
];

export const ACCESSORY_KEYWORDS = [
  "belt",
  "scarf",
  "stole",
  "dupatta",
  "sunglasses",
  "glasses",
  "hat",
  "cap",
  "beanie",
  "watch",
  "tie",
  "glove",
  "sock",
  "hairband",
  "hair clip",
  "umbrella",
];

// Earlier entries win only when two keywords end at the same word
// ("Lehenga Choli" → dresses rather than tops). Every item type label and
// alias from taxonomy.ts is added to its category's group.
const BASE_GROUPS: [GarmentCategory, string[]][] = [
  ["bags", BAG_KEYWORDS],
  ["jewellery", JEWELLERY_KEYWORDS],
  ["footwear", FOOTWEAR_KEYWORDS],
  ["dresses", DRESS_KEYWORDS],
  ["bottoms", BOTTOM_KEYWORDS],
  ["outerwear", OUTERWEAR_KEYWORDS],
  ["tops", TOP_KEYWORDS],
  ["accessories", ACCESSORY_KEYWORDS],
  ["other", []],
];

const TAXONOMY_PHRASES = taxonomyKeywords();

const KEYWORD_GROUPS: [GarmentCategory, string[]][] = BASE_GROUPS.map(([category, words]) => [
  category,
  [...new Set([...words, ...TAXONOMY_PHRASES.filter((k) => k.category === category).map((k) => k.phrase)])],
]);

const KEYWORD_PATTERNS: [GarmentCategory, RegExp][] = KEYWORD_GROUPS.flatMap(
  ([category, words]) =>
    words.map((w): [GarmentCategory, RegExp] => [category, new RegExp(`(?:^| )${w}(?:s|es)?(?= |$)`, "g")])
);

/** Categories precise enough to always trust when stored or chosen */
const SPECIFIC_CATEGORIES = new Set<GarmentCategory>([
  "tops",
  "bottoms",
  "dresses",
  "outerwear",
  "footwear",
  "bags",
  "jewellery",
]);

/** Stored values, user choices and Gemini major_category values → app category */
const CATEGORY_ALIASES: Record<string, GarmentCategory | "clothing"> = {
  top: "tops",
  tops: "tops",
  bottom: "bottoms",
  bottoms: "bottoms",
  dress: "dresses",
  dresses: "dresses",
  outerwear: "outerwear",
  footwear: "footwear",
  shoe: "footwear",
  shoes: "footwear",
  bag: "bags",
  bags: "bags",
  jewellery: "jewellery",
  jewelry: "jewellery",
  accessory: "accessories",
  accessories: "accessories",
  other: "other",
  clothing: "clothing",
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/t-shirt/g, "tshirt")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Infers a category from free text using its head noun: the keyword that
 * appears last wins ("Dress Shirt" → tops, "Shirt Dress" → dresses), and
 * anything after "with"/"for" is ignored ("Kurta with Dupatta" → tops).
 */
export function inferCategoryFromText(text?: string): GarmentCategory | null {
  if (!text) return null;
  const head = normalizeText(text).split(/ (?:with|for) /)[0];
  if (!head) return null;

  let best: { category: GarmentCategory; end: number } | null = null;
  for (const [category, pattern] of KEYWORD_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(head))) {
      const end = m.index + m[0].length;
      if (!best || end > best.end) best = { category, end };
    }
  }
  return best?.category ?? null;
}

/**
 * Normalizes an item's category using its category, subcategory, and name.
 * Ensures consistent taxonomy across Build, Closet, Outfit Builder, and AI Stylist.
 *
 * Guaranteed rules:
 * - A specific stored category (tops, bottoms, dresses, outerwear, footwear,
 *   bags, jewellery) is always kept, so saved and user-chosen values are never
 *   overridden.
 * - Vague values (accessories, other, Gemini's "Clothing", unknown) are refined
 *   from the subcategory, then the name. This is how handbags, hobo bags,
 *   totes and clutches filed under Accessories show up as Bags, and earrings,
 *   necklaces and bangles as Jewellery.
 */
export function getNormalizedCategory(item: {
  category?: string;
  subcategory?: string;
  name?: string;
}): GarmentCategory {
  const stored = CATEGORY_ALIASES[(item.category || "").toLowerCase().trim()];
  if (stored && stored !== "clothing" && SPECIFIC_CATEGORIES.has(stored)) {
    return stored;
  }

  const inferred =
    inferCategoryFromText(item.subcategory) ?? inferCategoryFromText(item.name);
  if (inferred) return inferred;

  return stored === "accessories" ? "accessories" : "other";
}
