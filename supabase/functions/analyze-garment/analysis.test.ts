// Run with: deno test supabase/functions/analyze-garment/
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { base64ByteLength, InvalidAnalysisError, normalizeAnalysis } from "./analysis.ts";

const valid = {
  style_branch: "Western",
  major_category: "Bags",
  subcategory: "Handbag",
  suggested_name: "Green Ostrich Leather Handbag",
  color: "Green",
  material: "Ostrich leather",
  pattern: "Textured",
  occasion: "formal",
  style: "classic",
  box_2d: [53, 107, 937, 882],
  confidence: 0.95,
};

Deno.test("keeps a well-formed analysis unchanged", () => {
  assertEquals<unknown>(normalizeAnalysis(valid), valid);
});

Deno.test("unwraps a box nested in an extra array", () => {
  const a = normalizeAnalysis({ ...valid, box_2d: [[52, 107, 936, 883]] });
  assertEquals(a.box_2d, [52, 107, 936, 883]);
});

Deno.test("drops an out-of-range or inverted box instead of guessing", () => {
  assertEquals(normalizeAnalysis({ ...valid, box_2d: [0, 0, 1200, 500] }).box_2d, undefined);
  assertEquals(normalizeAnalysis({ ...valid, box_2d: [900, 100, 100, 800] }).box_2d, undefined);
  assertEquals(normalizeAnalysis({ ...valid, box_2d: "nope" }).box_2d, undefined);
});

Deno.test("unknown enum values become neutral, never invented", () => {
  const a = normalizeAnalysis({ ...valid, style_branch: "Space", major_category: "Gadgets", occasion: "festive", style: "cyber" });
  assertEquals(a.style_branch, "Unknown");
  assertEquals(a.major_category, "Other");
  assertEquals(a.occasion, "");
  assertEquals(a.style, "");
});

Deno.test("enum matching is case-insensitive and canonicalised", () => {
  const a = normalizeAnalysis({ ...valid, major_category: "bags", occasion: "Formal" });
  assertEquals(a.major_category, "Bags");
  assertEquals(a.occasion, "formal");
});

Deno.test("clamps confidence and defaults it when missing", () => {
  assertEquals(normalizeAnalysis({ ...valid, confidence: 7 }).confidence, 1);
  assertEquals(normalizeAnalysis({ ...valid, confidence: -1 }).confidence, 0);
  assertEquals(normalizeAnalysis({ ...valid, confidence: undefined }).confidence, 0.5);
});

Deno.test("missing text fields become empty strings", () => {
  const a = normalizeAnalysis({ major_category: "Footwear", subcategory: "Sneakers", confidence: 0.9 });
  assertEquals(a.suggested_name, "");
  assertEquals(a.color, "");
  assertEquals(a.material, "");
});

Deno.test("rejects responses that describe no item", () => {
  assertThrows(() => normalizeAnalysis(null), InvalidAnalysisError);
  assertThrows(() => normalizeAnalysis([valid]), InvalidAnalysisError);
  assertThrows(() => normalizeAnalysis({ major_category: "Other", confidence: 0.2 }), InvalidAnalysisError);
});

Deno.test("base64ByteLength matches the decoded size", () => {
  for (const s of ["", "a", "ab", "abc", "abcd", "hello world!"]) {
    const b64 = btoa(s);
    assertEquals(base64ByteLength(b64), s.length);
  }
});

Deno.test("curated types and known aliases are written as their listed label", () => {
  assertEquals(normalizeAnalysis({ ...valid, subcategory: "hobo bag" }).subcategory, "Hobo Bag");
  assertEquals(normalizeAnalysis({ ...valid, major_category: "Clothing", subcategory: "Sari" }).subcategory, "Saree");
  assertEquals(normalizeAnalysis({ ...valid, major_category: "Jewellery", subcategory: "jhumki" }).subcategory, "Jhumkas");
  assertEquals(normalizeAnalysis({ ...valid, major_category: "Footwear", subcategory: "Mojri" }).subcategory, "Mojaris");
});

Deno.test("an uncurated type is kept as the model wrote it", () => {
  assertEquals(normalizeAnalysis({ ...valid, subcategory: "Bamboo-handle Bag" }).subcategory, "Bamboo-handle Bag");
});

Deno.test("design tradition is kept for jewellery only and canonicalised", () => {
  const j = { ...valid, major_category: "Jewellery", subcategory: "Jhumkas" };
  assertEquals(normalizeAnalysis({ ...j, design_tradition: "kundan" }).design_tradition, "Kundan");
  assertEquals(normalizeAnalysis({ ...j, design_tradition: "Nizami heirloom" }).design_tradition, "Nizami heirloom");
  assertEquals(normalizeAnalysis({ ...j, design_tradition: "" }).design_tradition, undefined);
  assertEquals(normalizeAnalysis({ ...valid, design_tradition: "Kundan" }).design_tradition, undefined);
});

Deno.test("an aesthetic name or placeholder is not a design tradition", () => {
  const j = { ...valid, major_category: "Jewellery", subcategory: "Jhumkas" };
  for (const v of ["Traditional", "western", "Indo-Western", "Unknown", "None", "N/A"]) {
    assertEquals(normalizeAnalysis({ ...j, design_tradition: v }).design_tradition, undefined, v);
  }
  assertEquals(normalizeAnalysis({ ...j, design_tradition: "Traditional Gold" }).design_tradition, "Traditional Gold");
});

Deno.test("responses from the older prompt (no design_tradition) still validate unchanged", () => {
  assertEquals<unknown>(normalizeAnalysis(valid), valid);
});

Deno.test("prompt lists curated types and traditions; schema adds an optional design_tradition", async () => {
  const { ANALYSIS_PROMPT, ANALYSIS_SCHEMA } = await import("./analysis.ts");
  for (const t of ["Jhumkas", "Juttis", "Potli Bag", "Salwar Suit", "Sports Bra", "Kundan", "Contemporary Kundan"]) {
    if (!ANALYSIS_PROMPT.includes(t)) throw new Error(`prompt is missing ${t}`);
  }
  if (ANALYSIS_PROMPT.includes("Other Top")) throw new Error("catch-all types should not be offered");
  assertEquals(ANALYSIS_SCHEMA.properties.design_tradition, { type: "STRING" });
  assertEquals(ANALYSIS_SCHEMA.required.includes("design_tradition"), false);
  assertEquals(ANALYSIS_SCHEMA.properties.major_category.enum, ["Clothing", "Footwear", "Bags", "Jewellery", "Accessories", "Other"]);
});

Deno.test("ambiguous predictions: no design tradition below the confidence threshold", () => {
  const j = { ...valid, major_category: "Jewellery", subcategory: "Necklace", design_tradition: "Kundan" };
  assertEquals(normalizeAnalysis({ ...j, confidence: 0.5 }).design_tradition, undefined);
  assertEquals(normalizeAnalysis({ ...j, confidence: 0.69 }).design_tradition, undefined);
  assertEquals(normalizeAnalysis({ ...j, confidence: 0.7 }).design_tradition, "Kundan");
  // a missing confidence defaults to 0.5, so no tradition either
  const { confidence: _c, ...noConfidence } = j;
  assertEquals(normalizeAnalysis(noConfidence).design_tradition, undefined);
});
