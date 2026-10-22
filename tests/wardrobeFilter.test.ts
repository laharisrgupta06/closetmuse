// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterWardrobe, matchesFilter, itemFacets, typeCounts, aestheticCounts } from "../src/utils/wardrobeFilter.ts";
import type { FilterableItem } from "../src/utils/wardrobeFilter.ts";

// Shapes taken from real rows: free-text subcategories, "Unknown" branches,
// bags and jewellery stored under Accessories, no design_tradition column yet
const ITEMS: (FilterableItem & { id: string })[] = [
  { id: "saree", name: "Red Banarasi Saree", category: "dresses", subcategory: "Saree", style_branch: "Traditional", color: "Red", material: "Silk" },
  { id: "kurti", name: "Cotton Kurti", category: "Clothing", subcategory: "Kurti", style_branch: "Indo-Western", color: "Blue" },
  { id: "jeans", name: "Baggy Jeans", category: "bottoms", subcategory: "Jeans", style_branch: "Western", color: "Blue", material: "Denim" },
  { id: "jhumka", name: "Gold Jhumkas", category: "accessories", subcategory: "Jhumkas", style_branch: "Traditional", color: "Gold", design_tradition: "Kundan" },
  { id: "studs", name: "Pearl Studs", category: "jewellery", subcategory: "Stud Earrings", style_branch: "Western", color: "White" },
  { id: "fusionring", name: "Statement Ring", category: "jewellery", subcategory: "Statement Ring", style_branch: "Indo-Western", design_tradition: "Contemporary Kundan" },
  { id: "hobo", name: "Hobo Bag", category: "accessories", subcategory: "", style_branch: "Unknown", color: "Tan" },
  { id: "juttis", name: "Embroidered Juttis", category: "footwear", subcategory: "Juttis", style_branch: "Traditional" },
  { id: "sneakers", name: "White Sneakers", category: "footwear", subcategory: "Sneakers", style_branch: "Western", color: "White" },
  { id: "mystery", name: "Mystery Garment", category: "other", subcategory: null, style_branch: null },
];
const ids = (f: Parameters<typeof filterWardrobe>[1]) => filterWardrobe(ITEMS, f, (x) => x).map((x) => x.id);

test("no filter returns everything", () => {
  assert.equal(ids({}).length, ITEMS.length);
  assert.equal(ids({ category: "all", aesthetic: "all", typeId: "all", tradition: "all", query: "  " }).length, ITEMS.length);
});

test("category filter uses normalized categories (bags/jewellery under Accessories)", () => {
  assert.deepEqual(ids({ category: "bags" }), ["hobo"]);
  assert.deepEqual(ids({ category: "jewellery" }), ["jhumka", "studs", "fusionring"]);
  assert.deepEqual(ids({ category: "tops" }), ["kurti"]);
});

test("aesthetic works across every category, not only jewellery", () => {
  assert.deepEqual(ids({ aesthetic: "Traditional" }), ["saree", "jhumka", "juttis"]);
  assert.deepEqual(ids({ aesthetic: "Western" }), ["jeans", "studs", "sneakers"]);
  assert.deepEqual(ids({ aesthetic: "Indo-Western" }), ["kurti", "fusionring"]);
  assert.deepEqual(ids({ aesthetic: "unspecified" }), ["hobo", "mystery"]);
});

test("filters combine: category + aesthetic + type + tradition", () => {
  assert.deepEqual(ids({ category: "footwear", aesthetic: "Traditional" }), ["juttis"]);
  assert.deepEqual(ids({ category: "jewellery", aesthetic: "Western" }), ["studs"]);
  assert.deepEqual(ids({ category: "jewellery", typeId: "jewellery:jhumkas" }), ["jhumka"]);
  assert.deepEqual(ids({ category: "jewellery", aesthetic: "Traditional", tradition: "kundan" }), ["jhumka"]);
  assert.deepEqual(ids({ tradition: "Contemporary Kundan" }), ["fusionring"]);
  assert.deepEqual(ids({ category: "bags", aesthetic: "Traditional" }), []);
});

test("item type is independent of aesthetic", () => {
  // Same type, different aesthetics stay distinguishable
  const all = ids({ typeId: "jewellery:statement-ring" });
  assert.deepEqual(all, ["fusionring"]);
  assert.deepEqual(ids({ typeId: "jewellery:statement-ring", aesthetic: "Western" }), []);
});

test("search matches every word across name, type, colour, material, aesthetic and tradition", () => {
  assert.deepEqual(ids({ query: "red saree" }), ["saree"]);
  assert.deepEqual(ids({ query: "SILK" }), ["saree"]);
  assert.deepEqual(ids({ query: "kundan" }), ["jhumka", "fusionring"]);
  assert.deepEqual(ids({ query: "indo-western" }), ["kurti", "fusionring"]);
  assert.deepEqual(ids({ query: "hobo" }), ["hobo"]);
  assert.deepEqual(ids({ query: "earrings" }), ["studs"]);
  assert.deepEqual(ids({ query: "white", category: "footwear" }), ["sneakers"]);
  assert.deepEqual(ids({ query: "nothing-like-this" }), []);
});

test("old Closet and member-wardrobe search results are still found", () => {
  // Substring of name, subcategory, colour, material or category
  for (const [q, id] of [["banar", "saree"], ["kurt", "kurti"], ["blu", "jeans"], ["denim", "jeans"], ["bags", "hobo"]]) {
    assert.ok(ids({ query: q }).includes(id), `${q} → ${id}`);
  }
});

test("facets read stored values without changing them", () => {
  const item = { ...ITEMS[6] };
  const f = itemFacets(item);
  assert.equal(f.category, "bags");
  assert.equal(f.type.label, "Hobo Bag");
  assert.equal(f.aesthetic, null);
  assert.deepEqual(item, ITEMS[6]);
  assert.equal(itemFacets(ITEMS[9]).type.label, "Other Item");
});

test("matchesFilter accepts precomputed facets", () => {
  assert.equal(matchesFilter(ITEMS[0], { aesthetic: "Traditional" }, itemFacets(ITEMS[0])), true);
});

test("type counts list only present types, in taxonomy order", () => {
  const j = typeCounts(ITEMS, "jewellery").map((x) => `${x.type.label}:${x.count}`);
  assert.deepEqual(j, ["Stud Earrings:1", "Jhumkas:1", "Statement Ring:1"]);
  assert.deepEqual(typeCounts(ITEMS, "outerwear"), []);
});

test("aesthetic counts include unspecified", () => {
  assert.deepEqual(aestheticCounts(ITEMS), { Traditional: 3, Western: 3, "Indo-Western": 2, unspecified: 2 });
});

test("sorting: newest, oldest, name and category order", async () => {
  const { sortWardrobe } = await import("../src/utils/wardrobeFilter.ts");
  const rows = [
    { name: "B Jeans", category: "bottoms", created_at: "2026-10-02T00:00:00Z" },
    { name: "A Hobo Bag", category: "accessories", subcategory: "Hobo Bag", created_at: "2026-10-03T00:00:00Z" },
    { name: "C Kurti", category: "tops", created_at: "2026-10-01T00:00:00Z" },
    { name: "A Juttis", category: "footwear", created_at: "2026-10-02T00:00:00Z" },
  ];
  const names = (s: "newest" | "oldest" | "name" | "category") => sortWardrobe(rows, s).map((r) => r.name).join(", ");
  assert.equal(names("newest"), "A Hobo Bag, A Juttis, B Jeans, C Kurti"); // tie broken by name
  assert.equal(names("oldest"), "C Kurti, A Juttis, B Jeans, A Hobo Bag");
  assert.equal(names("name"), "A Hobo Bag, A Juttis, B Jeans, C Kurti");
  // category uses the normalized category: the hobo bag stored as accessories sorts with Bags
  assert.equal(names("category"), "C Kurti, B Jeans, A Juttis, A Hobo Bag");
  assert.equal(rows[0].name, "B Jeans"); // input not mutated
});

test("occasion filter and search use the stored occasion", async () => {
  const { filterWardrobe: fw, isRefined, NO_REFINE } = await import("../src/utils/wardrobeFilter.ts");
  const rows = [
    { id: "a", name: "Silk Saree", category: "dresses", style_branch: "Traditional", occasion: "occasion" },
    { id: "b", name: "Blazer", category: "outerwear", style_branch: "Western", occasion: "work" },
    { id: "c", name: "Juttis", category: "footwear", style_branch: "Traditional", occasion: null },
  ];
  const ids = (f: object) => fw(rows, f, (x) => x).map((x) => x.id).join();
  assert.equal(ids({ occasion: "work" }), "b");
  assert.equal(ids({ occasion: "WORK" }), "b");
  assert.equal(ids({ occasion: "occasion", aesthetic: "Traditional" }), "a");
  assert.equal(ids({ query: "work" }), "b");
  assert.equal(isRefined(NO_REFINE), false);
  assert.equal(isRefined({ ...NO_REFINE, occasion: "work" }), true);
});

test("item numbers: search by #number, sort by number, stable under filters", async () => {
  const { filterWardrobe: fw, sortWardrobe } = await import("../src/utils/wardrobeFilter.ts");
  const rows = [
    { id: "a", name: "White shirt", category: "tops", item_number: 1, created_at: "2026-10-01T00:00:00Z" },
    { id: "b", name: "Gold earrings", category: "jewellery", item_number: 3, created_at: "2026-10-03T00:00:00Z" },
    { id: "c", name: "Black trousers", category: "bottoms", item_number: 2, created_at: "2026-10-02T00:00:00Z" },
    { id: "d", name: "Old row", category: "tops", item_number: null, created_at: "2026-09-01T00:00:00Z" },
  ];
  const q = (query: string) => fw(rows, { query }, (x) => x).map((x) => x.id).join();
  assert.equal(q("#003"), "b");
  assert.equal(q("#3"), "b");
  assert.equal(q("item 2"), "c");
  assert.equal(q("#9"), "");
  assert.equal(q("#001"), "a");
  assert.equal(sortWardrobe(rows, "number").map((x) => x.id).join(), "a,c,b,d");
  // Filtering or sorting never changes an item's own number
  const jewellery = fw(rows, { category: "jewellery" }, (x) => x);
  assert.equal(jewellery[0].item_number, 3);
});
