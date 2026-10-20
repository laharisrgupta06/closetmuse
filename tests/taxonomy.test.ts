// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAXONOMY,
  DESIGN_TRADITIONS,
  typesFor,
  typeById,
  otherType,
  resolveItemType,
  normalizeAesthetic,
} from "../src/utils/taxonomy.ts";

const CATEGORIES = ["tops", "bottoms", "dresses", "outerwear", "footwear", "accessories", "bags", "jewellery", "other"];

test("taxonomy covers exactly the 9 existing database categories", () => {
  assert.deepEqual(TAXONOMY.map((c) => c.category).sort(), [...CATEGORIES].sort());
});

test("every category has groups, curated types and a final 'Other …' type", () => {
  for (const c of TAXONOMY) {
    const types = typesFor(c.category);
    assert.ok(types.length >= 2, c.category);
    assert.match(otherType(c.category).label, /^Other /, c.category);
  }
  const counts = Object.fromEntries(TAXONOMY.map((c) => [c.category, typesFor(c.category).length]));
  for (const cat of ["tops", "bottoms", "dresses", "footwear", "bags", "jewellery", "accessories"]) {
    assert.ok(counts[cat] >= 15, `${cat} has ${counts[cat]} types`);
  }
});

test("type ids are unique and labels are unique within a category", () => {
  const ids = TAXONOMY.flatMap((c) => typesFor(c.category).map((t) => t.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const c of TAXONOMY) {
    const labels = typesFor(c.category).map((t) => t.label.toLowerCase());
    assert.equal(new Set(labels).size, labels.length, c.category);
  }
});

test("no item type appears in two categories (one record, one home)", () => {
  const seen = new Map<string, string>();
  for (const c of TAXONOMY) {
    for (const t of typesFor(c.category)) {
      const key = t.label.toLowerCase();
      assert.ok(!seen.has(key), `${t.label} in ${c.category} and ${seen.get(key)}`);
      seen.set(key, c.category);
    }
  }
});

test("ethnic wear, activewear and co-ords are groups inside existing categories", () => {
  const groups = TAXONOMY.flatMap((c) => c.groups.map((g) => `${c.category}/${g.label}`));
  assert.ok(groups.includes("dresses/Ethnic & traditional"));
  assert.ok(groups.includes("dresses/Co-ord & matching sets"));
  assert.ok(groups.includes("tops/Activewear"));
  assert.ok(groups.includes("bottoms/Ethnic & fusion"));
});

test("existing free-text subcategories resolve to taxonomy types without rewriting", () => {
  const r = (cat: string, sub: string, name = "") => resolveItemType(cat as never, sub, name).label;
  assert.equal(r("dresses", "Saree"), "Saree");
  assert.equal(r("dresses", "Sari"), "Saree");
  assert.equal(r("tops", "Kurti"), "Kurti");
  assert.equal(r("tops", "Sherwani"), "Sherwani");
  assert.equal(r("tops", "Blouse"), "Blouse");
  assert.equal(r("bottoms", "Jeans"), "Jeans");
  assert.equal(r("bags", "Handbag"), "Handbag");
  assert.equal(r("bags", "Hobo Bag"), "Hobo Bag");
  assert.equal(r("jewellery", "Jhumkas"), "Jhumkas");
  assert.equal(r("jewellery", "Earrings"), "Earrings");
  assert.equal(r("footwear", "Sneakers"), "Sneakers");
  assert.equal(r("footwear", "Boots"), "Boots");
});

test("the most specific type wins", () => {
  const r = (cat: string, sub: string) => resolveItemType(cat as never, sub).label;
  assert.equal(r("jewellery", "Gold Hoop Earrings"), "Hoop Earrings");
  assert.equal(r("footwear", "Black Ankle Boots"), "Ankle Boots");
  assert.equal(r("bottoms", "Denim Shorts"), "Denim Shorts");
  assert.equal(r("dresses", "Bridal Lehenga"), "Bridal Outfit");
  assert.equal(r("dresses", "Red Banarasi"), "Saree");
});

test("a specific type beats a broad one; otherwise the head noun wins", () => {
  const r = (cat: string, sub: string) => resolveItemType(cat as never, sub).label;
  // Values from real rows
  assert.equal(r("jewellery", "Choker Necklace"), "Choker");
  assert.equal(r("bottoms", "Jean"), "Jeans");
  assert.equal(r("tops", "Top"), "Other Top");
  assert.equal(r("tops", "Sharara Set"), "Other Top"); // stored as tops; never moved
  // Specific over broad, in either word order
  assert.equal(r("jewellery", "Gold Jhumka Earrings"), "Jhumkas");
  assert.equal(r("jewellery", "Pendant Necklace"), "Pendant");
  assert.equal(r("jewellery", "Bangle Bracelet"), "Bangles");
  assert.equal(r("outerwear", "Puffer Coat"), "Puffer Jacket");
  // Two broad or two specific types: the head noun (last) wins
  assert.equal(r("jewellery", "Chain Bracelet"), "Bracelet");
  assert.equal(r("outerwear", "Sweater Vest"), "Vest");
  // More words still wins first
  assert.equal(r("jewellery", "Kundan Stud Earrings"), "Stud Earrings");
});

test("every generic type id exists in the taxonomy", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../supabase/functions/_shared/taxonomy.ts", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("const GENERIC_TYPES"), src.indexOf("]);", src.indexOf("const GENERIC_TYPES")));
  const listed = [...block.matchAll(/"([a-z]+:[a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(listed.length >= 15);
  for (const id of listed) assert.ok(typeById(id), id);
});

test("name is used when the subcategory is empty; unknown values become 'Other …'", () => {
  assert.equal(resolveItemType("bags", "", "Embroidered Potli").label, "Potli Bag");
  assert.equal(resolveItemType("tops", "Mystery garment").label, "Other Top");
  assert.equal(resolveItemType("tops", null, null).label, "Other Top");
});

test("types are matched only inside the item's own category", () => {
  // A stored "tops" item called "Sweater" is not silently moved to outerwear
  assert.equal(resolveItemType("tops", "Sweater").label, "Other Top");
});

test("plurals and spelling variants match", () => {
  assert.equal(resolveItemType("jewellery", "Bangle").label, "Bangles");
  assert.equal(resolveItemType("jewellery", "jhumki").label, "Jhumkas");
  assert.equal(resolveItemType("footwear", "Mojri").label, "Mojaris");
  assert.equal(resolveItemType("tops", "graphic t-shirt").label, "T-Shirt");
});

test("aesthetic values: three styles, everything else unspecified", () => {
  assert.equal(normalizeAesthetic("Traditional"), "Traditional");
  assert.equal(normalizeAesthetic("western"), "Western");
  assert.equal(normalizeAesthetic("Indo-Western"), "Indo-Western");
  assert.equal(normalizeAesthetic("Indo Western"), "Indo-Western");
  assert.equal(normalizeAesthetic("Unknown"), null);
  assert.equal(normalizeAesthetic(""), null);
  assert.equal(normalizeAesthetic(null), null);
});

test("jewellery design traditions are grouped by aesthetic", () => {
  assert.ok(DESIGN_TRADITIONS.Traditional.includes("Kundan"));
  assert.ok(DESIGN_TRADITIONS.Traditional.includes("Polki"));
  assert.ok(DESIGN_TRADITIONS.Western.includes("Minimalist"));
  assert.ok(DESIGN_TRADITIONS["Indo-Western"].includes("Contemporary Kundan"));
});

test("typeById round-trips", () => {
  const t = resolveItemType("dresses", "Saree");
  assert.equal(typeById(t.id)?.category, "dresses");
});

test("every item type label and alias infers its own taxonomy category", async () => {
  const { inferCategoryFromText } = await import("../src/utils/category.ts");
  const wrong: string[] = [];
  for (const c of TAXONOMY) {
    for (const t of typesFor(c.category)) {
      if (t.label.startsWith("Other ")) continue;
      for (const phrase of [t.label, ...t.aliases]) {
        const got = inferCategoryFromText(phrase);
        if (got !== c.category) wrong.push(`${phrase}: ${got} (expected ${c.category})`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test("vague stored categories gain the new types; specific ones are still trusted", async () => {
  const { getNormalizedCategory } = await import("../src/utils/category.ts");
  const cat = (category: string, subcategory: string, name = "") => getNormalizedCategory({ category, subcategory, name });
  assert.equal(cat("Clothing", "Midi Skirt"), "bottoms");
  assert.equal(cat("Clothing", "Salwar Suit"), "dresses");
  assert.equal(cat("Clothing", "Lehenga Choli"), "dresses");
  assert.equal(cat("Clothing", "Kurta Pyjama"), "dresses");
  assert.equal(cat("Clothing", "Sports Bra"), "tops");
  assert.equal(cat("Clothing", "Co-Ord Set"), "dresses");
  assert.equal(cat("Accessories", "Maang Tikka"), "jewellery");
  assert.equal(cat("Accessories", "Kamarbandh"), "jewellery");
  assert.equal(cat("Accessories", "Dupatta"), "accessories");
  assert.equal(cat("Other", "Juttis"), "footwear");
  assert.equal(cat("Other", "Potli Bag"), "bags");
  // Stored categories are never moved, even for a "skirt"
  assert.equal(cat("dresses", "Skirt"), "dresses");
  assert.equal(cat("tops", "Sweater"), "tops");
});

test("ambiguous singulars are not keywords", async () => {
  const { inferCategoryFromText } = await import("../src/utils/category.ts");
  assert.equal(inferCategoryFromText("Flat"), null);
  assert.equal(inferCategoryFromText("Short"), null);
  assert.equal(inferCategoryFromText("Glass"), null);
  assert.equal(inferCategoryFromText("Platform"), null);
});

test("spec additions: matching sets, bridal accessories, extra jewellery traditions", () => {
  assert.equal(resolveItemType("dresses", "Matching Three-Piece Set").label, "Matching Three-Piece Set");
  assert.equal(resolveItemType("dresses", "two piece set").label, "Matching Two-Piece Set");
  assert.equal(resolveItemType("accessories", "Bridal Accessories").label, "Bridal Accessory");
  assert.ok(DESIGN_TRADITIONS.Western.includes("Layered Chains") && DESIGN_TRADITIONS.Western.includes("Modern Hoop") && DESIGN_TRADITIONS.Western.includes("Cuff"));
  assert.ok(DESIGN_TRADITIONS["Indo-Western"].includes("Fusion Choker") && DESIGN_TRADITIONS["Indo-Western"].includes("Layered Fusion"));
});
