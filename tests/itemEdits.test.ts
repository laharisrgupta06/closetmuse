// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { formValuesFrom, diffItemForm, missingOptionalColumn } from "../src/utils/itemEdits.ts";

// A real row shape: legacy "Unknown" branch, category stored as accessories,
// no design_tradition key (before migration 008)
const ROW = {
  name: "Green Leather Handbag",
  category: "accessories",
  style_branch: "Unknown",
  subcategory: "Handbag",
  color: "Green",
  material: "Leather",
  pattern: null,
  occasion: "everyday",
  style: null,
  brand: "",
  notes: "Gift from Mum ",
};

test("untouched form sends nothing, so every stored value is kept", () => {
  const initial = formValuesFrom(ROW);
  assert.deepEqual(diffItemForm(initial, { ...initial }), {});
  assert.equal(initial.design_tradition, "");
});

test("only changed fields are sent; others keep their stored values", () => {
  const initial = formValuesFrom(ROW);
  const changes = diffItemForm(initial, { ...initial, subcategory: "Tote Bag", style_branch: "Western" });
  assert.deepEqual(changes, { subcategory: "Tote Bag", style_branch: "Western" });
});

test("a cleared field is sent as null (the old form could not clear fields)", () => {
  const initial = formValuesFrom(ROW);
  assert.deepEqual(diffItemForm(initial, { ...initial, subcategory: "", color: "  " }), { subcategory: null, color: null });
});

test("a category shown differently is not rewritten unless the user changes it", () => {
  // The form shows "bags" (normalized) for a row stored as "accessories"
  const initial = { ...formValuesFrom(ROW), category: "bags" };
  assert.deepEqual(diffItemForm(initial, { ...initial }), {});
  assert.deepEqual(diffItemForm(initial, { ...initial, category: "jewellery" }), { category: "jewellery" });
});

test("whitespace-only changes are ignored; real values are trimmed", () => {
  const initial = formValuesFrom(ROW);
  assert.deepEqual(diffItemForm(initial, { ...initial, notes: "Gift from Mum" }), {});
  assert.deepEqual(diffItemForm(initial, { ...initial, design_tradition: "  Kundan " }), { design_tradition: "Kundan" });
});

test("name is never cleared", () => {
  const initial = formValuesFrom(ROW);
  assert.deepEqual(diffItemForm(initial, { ...initial, name: "" }), {});
});

test("missing optional columns are recognised in both PostgREST error shapes", () => {
  assert.equal(missingOptionalColumn({ code: "PGRST204", message: "Could not find the 'design_tradition' column of 'wardrobe_items' in the schema cache" }), "design_tradition");
  assert.equal(missingOptionalColumn({ code: "42703", message: "column wardrobe_items.design_tradition does not exist" }), "design_tradition");
  assert.equal(missingOptionalColumn({ code: "PGRST204", message: "Could not find the 'original_image_url' column of 'wardrobe_items' in the schema cache" }), "original_image_url");
});

test("required columns and other errors are never treated as droppable", () => {
  assert.equal(missingOptionalColumn({ code: "PGRST204", message: "Could not find the 'name' column of 'wardrobe_items' in the schema cache" }), null);
  assert.equal(missingOptionalColumn({ code: "42501", message: "permission denied" }), null);
  assert.equal(missingOptionalColumn({ code: "23514", message: "violates check constraint" }), null);
  assert.equal(missingOptionalColumn(null), null);
});
