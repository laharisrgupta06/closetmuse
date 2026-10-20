// Run with: deno test supabase/functions/ai-stylist/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildCatalog, buildPrompt, normalizeLooks, slotOf, type StylistItemRow } from "./outfit.ts";

const wardrobe: StylistItemRow[] = [
  { id: "saree", name: "Red Banarasi Saree", category: "dresses", subcategory: "Saree", style_branch: "Traditional", color: "Red", material: "Silk" },
  { id: "blouse", name: "Gold Silk Blouse", category: "tops", subcategory: "Blouse", style_branch: "Traditional" },
  { id: "jeans", name: "Blue Slim Jeans", category: "bottoms" },
  { id: "heels", name: "Black Stilettos", category: "footwear", subcategory: "Heels", style_branch: "Western" },
  { id: "juttis", name: "Embroidered Juttis", category: "footwear", subcategory: "Juttis", style_branch: "Traditional" },
  { id: "tote", name: "Floral Tote", category: "accessories", subcategory: "Tote" }, // legacy mis-filed bag
  { id: "studs", name: "Gold Studs", category: "jewellery", subcategory: "Earrings" },
  { id: "necklace", name: "Temple Necklace", category: "accessories", subcategory: "Necklace" },
  { id: "bangles", name: "Gold Bangles", category: "jewellery" },
  { id: "jhumkas", name: "Kundan Jhumkas", category: "jewellery" },
];

const look = (pieces: string[], extra: Record<string, unknown> = {}) => ({
  title: "Diwali", styling_notes: "Notes", pieces: pieces.map((id) => ({ id, reason: `why ${id}` })), ...extra,
});

Deno.test("slots come from the normalized category (legacy accessories → bag/jewellery)", () => {
  assertEquals(slotOf(wardrobe[5]), "bag");
  assertEquals(slotOf(wardrobe[7]), "jewellery");
  assertEquals(slotOf(wardrobe[0]), "dress");
});

Deno.test("catalog groups every item by role and reports empty roles", () => {
  const { groups, emptySlots } = buildCatalog(wardrobe);
  assertEquals(groups.jewellery.map((i) => i.id).sort(), ["bangles", "jhumkas", "necklace", "studs"]);
  assertEquals(groups.bag.map((i) => i.id), ["tote"]);
  assertEquals(groups.dress[0].tradition, "Traditional");
  assertEquals(groups.dress[0].type, "Saree");
  assert(emptySlots.includes("layer") && emptySlots.includes("accessory"));
});

Deno.test("prompt contains the request and every item id", () => {
  const prompt = buildPrompt({ prompt: "Diwali puja", occasion: "occasion", stylePreference: "" }, wardrobe);
  assert(prompt.includes("Diwali puja"));
  for (const item of wardrobe) assert(prompt.includes(`"${item.id}"`), item.id);
});

Deno.test("unknown ids and repeats are dropped", () => {
  const [l] = normalizeLooks({ looks: [look(["saree", "ghost", "saree", "juttis"])] }, wardrobe);
  assertEquals(l.pieces.map((p) => p.id), ["saree", "juttis"]);
});

Deno.test("per-slot limits keep the first choice", () => {
  const [l] = normalizeLooks({ looks: [look(["saree", "juttis", "heels", "studs", "jhumkas", "bangles", "necklace"])] }, wardrobe);
  assertEquals(l.pieces.filter((p) => p.slot === "footwear").map((p) => p.id), ["juttis"]);
  assertEquals(l.pieces.filter((p) => p.slot === "jewellery").length, 3);
});

Deno.test("pieces are ordered main garments first, accessories last", () => {
  const [l] = normalizeLooks({ looks: [look(["jhumkas", "tote", "juttis", "blouse", "saree"])] }, wardrobe);
  assertEquals(l.pieces.map((p) => p.slot), ["dress", "top", "footwear", "bag", "jewellery"]);
});

Deno.test("a look without a main garment is dropped", () => {
  assertEquals(normalizeLooks({ looks: [look(["juttis", "studs"])] }, wardrobe), []);
});

Deno.test("an alternative identical to an earlier look is dropped; max 3 looks", () => {
  const looks = normalizeLooks({ looks: [
    look(["saree", "juttis"]), look(["juttis", "saree"]), look(["saree", "heels"]),
    look(["blouse", "jeans"]), look(["saree", "tote"]),
  ] }, wardrobe);
  assertEquals(looks.length, 3);
  assertEquals(looks.map((l) => l.pieces.map((p) => p.id).join("+")), ["saree+juttis", "saree+heels", "blouse+jeans"]);
});

Deno.test("missing notes are kept only for slots that stayed empty", () => {
  const [l] = normalizeLooks({ looks: [look(["saree", "juttis"], { missing: [
    { slot: "footwear", note: "should be dropped" }, { slot: "bag", note: "A potli would finish it" }, { slot: "nonsense", note: "x" },
  ] })] }, wardrobe);
  assertEquals(l.missing, [{ slot: "bag", note: "A potli would finish it" }]);
});

Deno.test("garbage input yields no looks", () => {
  assertEquals(normalizeLooks(null, wardrobe), []);
  assertEquals(normalizeLooks({ looks: "no" }, wardrobe), []);
});
