// Wardrobe taxonomy shared by the React app (re-exported from
// src/utils/taxonomy.ts) and the Edge Functions. Keep it free of app or
// Deno-specific imports.
//
// Four independent dimensions, each stored in its own column:
//   main category   wardrobe_items.category        (the existing 9 values)
//   item type       wardrobe_items.subcategory     (a label from this file, or free text)
//   aesthetic       wardrobe_items.style_branch    (Traditional | Western | Indo-Western)
//   design tradition wardrobe_items.design_tradition (optional, e.g. Kundan)
//
// Ethnic wear, activewear/loungewear and co-ord sets are GROUPS of item types
// inside the main categories, not extra categories, so the Outfit Builder,
// AI Stylist and existing data keep working unchanged.

import type { GarmentCategory } from "./category.ts";

export const AESTHETICS = ["Traditional", "Western", "Indo-Western"] as const;
export type Aesthetic = (typeof AESTHETICS)[number];

export interface ItemType {
  /** Stable id: "<category>:<slug>" */
  id: string;
  /** Value stored in wardrobe_items.subcategory and shown to users */
  label: string;
  /** Other spellings that identify this type in existing free text */
  aliases: string[];
  /** Usual aesthetics; only used to order suggestions, never to restrict */
  typical: Aesthetic[];
}

export interface TypeGroup {
  label: string;
  types: ItemType[];
}

export interface CategoryTaxonomy {
  category: GarmentCategory;
  label: string;
  groups: TypeGroup[];
}

const T: Aesthetic = "Traditional";
const W: Aesthetic = "Western";
const IW: Aesthetic = "Indo-Western";

type TypeSpec = [label: string, aliases?: string[], typical?: Aesthetic[]];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function build(category: GarmentCategory, label: string, groups: [string, TypeSpec[]][]): CategoryTaxonomy {
  return {
    category,
    label,
    groups: groups.map(([groupLabel, specs]) => ({
      label: groupLabel,
      types: specs.map(([typeLabel, aliases = [], typical = []]) => ({
        id: `${category}:${slug(typeLabel)}`,
        label: typeLabel,
        aliases,
        typical,
      })),
    })),
  };
}

export const TAXONOMY: CategoryTaxonomy[] = [
  build("tops", "Tops", [
    ["Everyday & casual", [
      ["T-Shirt", ["tee", "tshirt", "graphic tee"], [W]],
      ["Shirt", ["button down", "button-down shirt", "dress shirt", "oxford shirt"], [W]],
      ["Blouse", [], [W, IW]],
      ["Crop Top", [], [W]],
      ["Tank Top", ["tank"], [W]],
      ["Camisole", ["cami"], [W]],
      ["Halter Top", ["halter"], [W]],
      ["Tube Top", [], [W]],
      ["Off-Shoulder Top", ["off shoulder"], [W]],
      ["Peplum Top", ["peplum"], [W, IW]],
      ["Bodysuit", [], [W]],
      ["Corset Top", ["bustier"], [W]],
      ["Polo", ["polo shirt"], [W]],
      ["Sweatshirt", [], [W]],
      ["Formal Top", [], [W]],
    ]],
    ["Ethnic & fusion", [
      ["Kurti", [], [T, IW]],
      ["Kurta", [], [T, IW]],
      ["Tunic", [], [IW, W]],
      ["Choli", ["saree blouse", "lehenga blouse"], [T]],
      ["Sherwani", [], [T]],
      ["Ethnic Top", [], [T]],
      ["Fusion Top", ["indo western top"], [IW]],
    ]],
    ["Activewear", [
      ["Sports Bra", ["bra"], [W]],
      ["Gym Top", ["workout top", "athletic top"], [W]],
    ]],
    ["Other", [["Other Top"]]],
  ]),

  build("bottoms", "Bottoms", [
    ["Trousers & jeans", [
      ["Jeans", ["denim"], [W]],
      ["Jeggings", [], [W]],
      ["Straight-Leg Trousers", ["straight leg"], [W]],
      ["Wide-Leg Trousers", ["wide leg"], [W]],
      ["Formal Trousers", ["dress pants", "suit trousers"], [W]],
      ["Casual Trousers", ["trousers", "pants", "chinos", "chino"], [W]],
      ["Cargo Pants", ["cargos"], [W]],
      ["Culottes", [], [W, IW]],
      ["Leggings", [], [W]],
    ]],
    ["Shorts & skirts", [
      ["Shorts", [], [W]],
      ["Denim Shorts", [], [W]],
      ["Skirt", [], [W]],
      ["Mini Skirt", [], [W]],
      ["Midi Skirt", [], [W]],
      ["Maxi Skirt", [], [W, IW]],
    ]],
    ["Ethnic & fusion", [
      ["Salwar", [], [T]],
      ["Churidar", [], [T]],
      ["Patiala Pants", ["patiala"], [T]],
      ["Palazzo Pants", ["palazzo"], [T, IW]],
      ["Sharara Pants", ["sharara"], [T, IW]],
      ["Gharara Pants", ["gharara"], [T]],
      ["Dhoti Pants", ["dhoti"], [T, IW]],
    ]],
    ["Activewear & lounge", [
      ["Track Pants", ["trackpants"], [W]],
      ["Joggers", ["jogger"], [W]],
      ["Gym Shorts", [], [W]],
      ["Yoga Pants", [], [W]],
      ["Lounge Pants", ["pyjama", "pajama pants", "pajamas"], [W]],
    ]],
    ["Other", [["Other Bottom"]]],
  ]),

  build("dresses", "Dresses & one-pieces", [
    ["Dresses", [
      ["Dress", [], [W]],
      ["Casual Dress", ["sundress"], [W]],
      ["Formal Dress", [], [W]],
      ["Cocktail Dress", [], [W]],
      ["Evening Dress", [], [W]],
      ["Maxi Dress", [], [W]],
      ["Midi Dress", [], [W]],
      ["Mini Dress", [], [W]],
      ["Shirt Dress", [], [W]],
      ["Wrap Dress", [], [W]],
      ["Bodycon Dress", ["bodycon"], [W]],
      ["A-Line Dress", ["a line dress"], [W]],
      ["Gown", ["ball gown"], [W, IW]],
      ["Kaftan", ["caftan"], [W, IW]],
    ]],
    ["One-pieces", [
      ["Jumpsuit", [], [W]],
      ["Playsuit", [], [W]],
      ["Romper", [], [W]],
    ]],
    ["Ethnic & traditional", [
      ["Saree", ["sari", "banarasi", "kanjeevaram"], [T]],
      ["Lehenga", ["lehenga choli", "chaniya choli"], [T]],
      ["Ghagra", ["ghagra choli"], [T]],
      ["Anarkali", ["anarkali suit", "anarkali dress"], [T, IW]],
      ["Salwar Suit", ["salwar kameez", "churidar suit", "punjabi suit"], [T]],
      ["Sharara Set", ["sharara suit"], [T]],
      ["Gharara Set", ["gharara suit"], [T]],
      ["Kurta Set", ["kurta pyjama", "kurta pajama"], [T, IW]],
      ["Bridal Outfit", ["bridal lehenga", "bridal wear"], [T]],
      ["Festive Outfit", ["festive wear"], [T, IW]],
      ["Ethnic Dress", [], [T]],
    ]],
    ["Fusion", [
      ["Fusion Dress", ["indo western dress"], [IW]],
      ["Indo-Western Gown", ["indo western gown"], [IW]],
    ]],
    ["Co-ord & matching sets", [
      ["Casual Co-Ord Set", ["co ord set", "coord set", "co-ord", "matching set"], [W]],
      ["Formal Co-Ord Set", [], [W]],
      ["Ethnic Co-Ord Set", [], [T]],
      ["Fusion Co-Ord Set", [], [IW]],
      ["Lounge Set", [], [W]],
      ["Matching Two-Piece Set", ["two piece set"], [W, IW]],
      ["Matching Three-Piece Set", ["three piece set"], [W, T, IW]],
    ]],
    ["Swimwear", [
      ["Swimsuit", ["swimming costume", "one piece"], [W]],
      ["Bikini", [], [W]],
      ["Beach Cover-Up", ["cover up", "sarong"], [W]],
    ]],
    ["Night & activewear", [
      ["Nightgown", ["nightdress", "nightie"], [W]],
      ["Pajama Set", ["pyjama set", "night suit"], [W]],
      ["Robe", ["bathrobe"], [W]],
      ["Tracksuit", [], [W]],
    ]],
    ["Other", [["Other One-Piece"]]],
  ]),

  build("outerwear", "Outerwear", [
    ["Jackets & blazers", [
      ["Jacket", [], [W]],
      ["Denim Jacket", [], [W]],
      ["Leather Jacket", [], [W]],
      ["Bomber Jacket", ["bomber"], [W]],
      ["Puffer Jacket", ["puffer"], [W]],
      ["Blazer", [], [W]],
      ["Waistcoat", [], [W, IW]],
      ["Vest", ["gilet"], [W]],
    ]],
    ["Coats", [
      ["Coat", [], [W]],
      ["Trench Coat", ["trench"], [W]],
      ["Overcoat", [], [W]],
      ["Poncho", [], [W]],
    ]],
    ["Knitwear & layers", [
      ["Sweater", ["jumper", "pullover"], [W]],
      ["Cardigan", [], [W]],
      ["Hoodie", [], [W]],
      ["Shrug", [], [W, IW]],
      ["Cape", [], [IW, W]],
    ]],
    ["Ethnic & fusion", [
      ["Ethnic Jacket", [], [T, IW]],
      ["Nehru Jacket", ["bandhgala"], [T, IW]],
      ["Embellished Jacket", [], [IW]],
      ["Shawl", ["pashmina"], [T]],
    ]],
    ["Other", [["Other Outerwear"]]],
  ]),

  build("footwear", "Footwear", [
    ["Sneakers & sport", [
      ["Sneakers", ["trainers"], [W]],
      ["Running Shoes", [], [W]],
      ["Sports Shoes", [], [W]],
    ]],
    ["Everyday & formal", [
      ["Casual Shoes", [], [W]],
      ["Formal Shoes", ["oxfords", "derby shoes", "brogues"], [W]],
      ["Loafers", [], [W]],
      ["Flats", [], [W]],
      ["Ballet Flats", [], [W]],
      ["Mules", [], [W]],
      ["Espadrilles", [], [W]],
    ]],
    ["Boots", [
      ["Boots", [], [W]],
      ["Ankle Boots", [], [W]],
      ["Knee-High Boots", ["knee high boots"], [W]],
    ]],
    ["Heels", [
      ["Heels", ["pumps"], [W]],
      ["Stilettos", [], [W]],
      ["Block Heels", [], [W, IW]],
      ["Kitten Heels", [], [W]],
      ["Wedges", [], [W]],
      ["Platforms", ["platform heels"], [W]],
    ]],
    ["Sandals & slides", [
      ["Sandals", [], [W, IW]],
      ["Slides", [], [W]],
      ["Flip-Flops", ["flip flops", "chappals"], [W]],
      ["Slippers", [], [W]],
      ["Clogs", [], [W]],
    ]],
    ["Ethnic", [
      ["Juttis", ["jutti"], [T, IW]],
      ["Mojaris", ["mojari", "mojri"], [T]],
      ["Kolhapuri Chappals", ["kolhapuri"], [T]],
      ["Ethnic Flats", [], [T, IW]],
      ["Bridal Footwear", [], [T]],
    ]],
    ["Other", [["Other Footwear"]]],
  ]),

  build("bags", "Bags", [
    ["Everyday", [
      ["Handbag", [], [W]],
      ["Shoulder Bag", ["jhola"], [W, IW]],
      ["Crossbody Bag", ["crossbody"], [W]],
      ["Tote Bag", ["tote"], [W]],
      ["Hobo Bag", ["hobo"], [W]],
      ["Bucket Bag", [], [W]],
      ["Satchel", [], [W]],
      ["Sling Bag", ["sling"], [W]],
      ["Mini Bag", [], [W]],
      ["Backpack", [], [W]],
      ["Messenger Bag", [], [W]],
      ["Laptop Bag", [], [W]],
    ]],
    ["Evening & occasion", [
      ["Clutch", [], [W, IW]],
      ["Evening Bag", [], [W]],
      ["Potli Bag", ["potli"], [T]],
      ["Embroidered Bag", [], [T, IW]],
      ["Beaded Bag", [], [IW, W]],
      ["Bridal Bag", ["bridal clutch"], [T]],
    ]],
    ["Travel", [
      ["Travel Bag", [], [W]],
      ["Duffel Bag", ["duffel", "duffle"], [W]],
    ]],
    ["Wallets & purses", [
      ["Wallet", [], [W]],
      ["Purse", [], [W]],
      ["Card Holder", [], [W]],
      ["Pouch", [], [W, T]],
    ]],
    ["Other", [["Other Bag"]]],
  ]),

  build("jewellery", "Jewellery", [
    ["Earrings", [
      ["Earrings", [], [W, T, IW]],
      ["Stud Earrings", ["studs"], [W]],
      ["Hoop Earrings", ["hoops"], [W]],
      ["Drop Earrings", [], [W, IW]],
      ["Dangle Earrings", ["danglers"], [W, IW]],
      ["Jhumkas", ["jhumka", "jhumki"], [T, IW]],
      ["Chandbalis", ["chandbali"], [T, IW]],
      ["Ear Cuffs", [], [W, IW]],
      ["Ear Climbers", [], [W]],
    ]],
    ["Necklaces", [
      ["Necklace", [], [W, T, IW]],
      ["Choker", [], [W, T, IW]],
      ["Long Necklace", [], [T, W]],
      ["Layered Necklace", [], [W, IW]],
      ["Pendant", [], [W]],
      ["Chain", [], [W]],
      ["Mangalsutra", [], [T]],
      ["Rani Haar", ["rani haar"], [T]],
      ["Temple Necklace", [], [T]],
    ]],
    ["Hands & arms", [
      ["Bracelet", [], [W]],
      ["Bangles", [], [T, IW]],
      ["Kada", [], [T]],
      ["Cuff Bracelet", ["cuff"], [W]],
      ["Ring", ["finger ring"], [W, T]],
      ["Statement Ring", ["cocktail ring"], [W]],
    ]],
    ["Face & hair", [
      ["Nose Pin", ["nose stud"], [T]],
      ["Nose Ring", ["nath"], [T]],
      ["Maang Tikka", ["tikka", "maang tika"], [T]],
      ["Matha Patti", [], [T]],
      ["Passa", ["jhoomar"], [T]],
      ["Hair Jewellery", [], [T, IW]],
    ]],
    ["Body", [
      ["Anklet", ["payal"], [T, W]],
      ["Toe Ring", ["bichiya"], [T]],
      ["Kamarbandh", ["waist chain"], [T]],
    ]],
    ["Sets & pins", [
      ["Jewellery Set", ["jewelry set", "necklace set"], [T, IW]],
      ["Bridal Jewellery Set", ["bridal jewelry set"], [T]],
      ["Brooch", [], [W]],
    ]],
    ["Other", [["Other Jewellery"]]],
  ]),

  build("accessories", "Accessories", [
    ["Headwear & hair", [
      ["Cap", ["baseball cap"], [W]],
      ["Bucket Hat", [], [W]],
      ["Beanie", [], [W]],
      ["Beret", [], [W]],
      ["Fedora", [], [W]],
      ["Sun Hat", ["wide brim hat"], [W]],
      ["Fascinator", [], [W]],
      ["Hairband", ["headband"], [W]],
      ["Hair Clip", ["claw clip"], [W]],
      ["Scrunchie", [], [W]],
      ["Hair Bow", [], [W]],
      ["Hair Pin", ["bobby pin"], [W, T]],
      ["Decorative Comb", [], [T]],
      ["Hair Ornament", ["gajra", "hair accessory"], [T]],
    ]],
    ["Belts", [
      ["Belt", [], [W]],
      ["Leather Belt", [], [W]],
      ["Fabric Belt", [], [W]],
      ["Statement Belt", [], [W]],
      ["Waist Belt", [], [W, IW]],
      ["Corset Belt", [], [W]],
      ["Ethnic Belt", [], [T]],
    ]],
    ["Eyewear", [
      ["Sunglasses", [], [W]],
      ["Aviators", [], [W]],
      ["Wayfarers", [], [W]],
      ["Round Frames", [], [W]],
      ["Cat-Eye Sunglasses", ["cat eye"], [W]],
      ["Oversized Sunglasses", [], [W]],
      ["Sports Sunglasses", [], [W]],
      ["Optical Glasses", ["spectacles", "eyeglasses"], [W]],
    ]],
    ["Scarves & drapes", [
      ["Scarf", [], [W]],
      ["Silk Scarf", [], [W]],
      ["Bandana", [], [W]],
      ["Stole", [], [W, T]],
      ["Dupatta", ["chunni"], [T]],
      ["Pocket Square", [], [W]],
      ["Veil", ["bridal veil"], [T, W]],
      ["Bridal Accessory", ["bridal accessories"], [T]],
    ]],
    ["Watches", [
      ["Watch", ["analog watch", "digital watch"], [W]],
      ["Smartwatch", ["smart watch"], [W]],
      ["Watch Strap", [], [W]],
    ]],
    ["Small accessories", [
      ["Gloves", [], [W]],
      ["Socks", [], [W]],
      ["Tights", ["stockings"], [W]],
      ["Tie", ["necktie"], [W]],
      ["Bow Tie", [], [W]],
      ["Keychain", [], [W]],
      ["Umbrella", [], [W]],
    ]],
    ["Other", [["Other Accessory"]]],
  ]),

  build("other", "Other", [
    ["Other", [
      ["Thermal Wear", ["thermals"], [W]],
      ["Other Item"],
    ]],
  ]),
];

/** Jewellery design traditions, grouped by aesthetic (optional, never inferred from item type) */
export const DESIGN_TRADITIONS: Record<Aesthetic, string[]> = {
  Traditional: [
    "Kundan", "Polki", "Temple", "Antique", "Meenakari", "Thewa", "Kemp", "Jadau",
    "Traditional Gold", "Traditional Silver", "Oxidised", "Filigree", "Tribal", "Bridal",
    "Heritage", "Traditional Pearl", "Traditional Stone",
  ],
  Western: [
    "Minimalist", "Contemporary Gold", "Contemporary Silver", "Pearl", "Diamond", "Geometric",
    "Statement", "Chunky", "Layered Chains", "Charm", "Cuff", "Modern Hoop", "Everyday", "Formal",
  ],
  "Indo-Western": [
    "Fusion", "Contemporary Kundan", "Modern Temple-Inspired", "Indo-Western Statement",
    "Contemporary Jhumka", "Fusion Choker", "Contemporary Polki", "Ethnic-Inspired Modern",
    "Layered Fusion", "Contemporary Bridal Fusion",
  ],
};

export const ALL_DESIGN_TRADITIONS: string[] = [...new Set(Object.values(DESIGN_TRADITIONS).flat())];

const BY_CATEGORY = new Map(TAXONOMY.map((c) => [c.category, c]));
const ALL_TYPES = TAXONOMY.flatMap((c) => c.groups.flatMap((g) => g.types.map((t) => ({ ...t, category: c.category }))));
const BY_ID = new Map(ALL_TYPES.map((t) => [t.id, t]));

export function categoryTaxonomy(category: GarmentCategory): CategoryTaxonomy {
  return BY_CATEGORY.get(category) ?? BY_CATEGORY.get("other")!;
}

export function typesFor(category: GarmentCategory): ItemType[] {
  return categoryTaxonomy(category).groups.flatMap((g) => g.types);
}

export function typeById(id: string): (ItemType & { category: GarmentCategory }) | undefined {
  return BY_ID.get(id);
}

/** The catch-all type of a category ("Other Top", "Other Bag"…) */
export function otherType(category: GarmentCategory): ItemType {
  const types = typesFor(category);
  return types[types.length - 1];
}

/** Last words whose singular form is a different, common word ("Flats" → "flat") */
const AMBIGUOUS_SINGULARS = new Set(["flat", "short", "slide", "platform", "glass", "tight", "jean", "cargo", "frame"]);

/**
 * Every label and alias as a normalized phrase, plus its singular form where
 * that is unambiguous, for category inference (category.ts). "Other …"
 * catch-all types are left out.
 */
export function taxonomyKeywords(): { category: GarmentCategory; phrase: string }[] {
  const out: { category: GarmentCategory; phrase: string }[] = [];
  for (const t of ALL_TYPES) {
    if (t.label.startsWith("Other ")) continue;
    for (const raw of [t.label, ...t.aliases]) {
      const phrase = norm(raw);
      out.push({ category: t.category, phrase });
      const words = phrase.split(" ");
      const last = singularWord(words[words.length - 1]);
      if (!AMBIGUOUS_SINGULARS.has(last)) {
        out.push({ category: t.category, phrase: [...words.slice(0, -1), last].join(" ") });
      }
    }
  }
  return out;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/t-shirt/g, "tshirt").replace(/[^a-z0-9]+/g, " ").trim();
const singularWord = (w: string) => {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (/(ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};
const singular = (s: string) => s.split(" ").map(singularWord).join(" ");

/**
 * Broad types that a more specific word in the same text should beat:
 * "Choker Necklace" is a Choker, "Gold Jhumka Earrings" are Jhumkas.
 */
const GENERIC_TYPES = new Set([
  "tops:shirt",
  "bottoms:casual-trousers", "bottoms:skirt", "bottoms:shorts",
  "dresses:dress", "dresses:gown",
  "outerwear:jacket", "outerwear:coat",
  "footwear:boots", "footwear:heels", "footwear:sandals", "footwear:flats",
  "jewellery:earrings", "jewellery:necklace", "jewellery:bracelet", "jewellery:ring", "jewellery:chain",
  "accessories:belt", "accessories:scarf", "accessories:watch",
]);

/** Lexicographic comparison: the first differing position decides */
const outranks = (a: number[], b: number[]) => {
  const i = a.findIndex((v, k) => v !== b[k]);
  return i >= 0 && a[i] > b[i];
};

/**
 * Finds the taxonomy type for an item within its category, from the stored
 * subcategory first and then the name. When several types match, the one
 * with the longest phrase in words wins ("Hoop Earrings" over "Earrings"),
 * then a specific type over a broad one ("Choker" over "Necklace"), then the
 * later word (the head noun, "Sweater Vest" → Vest). Unmatched values
 * resolve to the category's "Other …" type; nothing is rewritten.
 */
export function resolveItemType(
  category: GarmentCategory,
  subcategory?: string | null,
  name?: string | null
): ItemType {
  const types = typesFor(category);
  for (const text of [subcategory, name]) {
    if (!text || !text.trim()) continue;
    const hay = ` ${singular(norm(text))} `;
    let best: { type: ItemType; score: [number, number, number] } | null = null;
    for (const type of types) {
      for (const phrase of [type.label, ...type.aliases]) {
        const p = singular(norm(phrase));
        const at = p ? hay.lastIndexOf(` ${p} `) : -1;
        if (at < 0) continue;
        const score: [number, number, number] = [
          p.split(" ").length,
          GENERIC_TYPES.has(type.id) ? 0 : 1,
          at + p.length,
        ];
        if (!best || outranks(score, best.score)) best = { type, score };
      }
    }
    if (best) return best.type;
  }
  return otherType(category);
}

let canonical: Map<string, string | null> | null = null;

/**
 * The curated label when the whole text names one type, by label or alias
 * ("sari" → "Saree", "jhumki" → "Jhumkas"); null when it is anything else or
 * would be ambiguous. Used to tidy new AI output, never to rewrite stored data.
 */
export function canonicalTypeLabel(text?: string | null): string | null {
  if (!canonical) {
    canonical = new Map();
    for (const t of ALL_TYPES) {
      for (const phrase of [t.label, ...t.aliases]) {
        const key = singular(norm(phrase));
        const seen = canonical.get(key);
        canonical.set(key, seen === undefined || seen === t.label ? t.label : null);
      }
    }
  }
  const key = singular(norm(text ?? ""));
  return key ? canonical.get(key) ?? null : null;
}

/** A known design tradition in its listed spelling, or null */
export function canonicalTradition(text?: string | null): string | null {
  const key = norm(text ?? "");
  return key ? ALL_DESIGN_TRADITIONS.find((t) => norm(t) === key) ?? null : null;
}

/** Reads style_branch as an aesthetic; "Unknown", empty or unrecognised values are unspecified */
export function normalizeAesthetic(value?: string | null): Aesthetic | null {
  const v = (value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (v === "traditional" || v === "ethnic") return "Traditional";
  if (v === "western") return "Western";
  if (v === "indowestern" || v === "fusion") return "Indo-Western";
  return null;
}
