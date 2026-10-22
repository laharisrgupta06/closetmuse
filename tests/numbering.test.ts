// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatItemNumber, formatOutfitNumber, itemReference, outfitReference, parseItemNumber } from "../src/utils/numbering.ts";

test("item numbers are zero-padded to three digits and grow beyond", () => {
  assert.equal(formatItemNumber(1), "#001");
  assert.equal(formatItemNumber(12), "#012");
  assert.equal(formatItemNumber(999), "#999");
  assert.equal(formatItemNumber(1234), "#1234");
});

test("no stored number means no label (never invented from list positions)", () => {
  for (const v of [null, undefined, 0, -3, 2.5, Number.NaN]) {
    assert.equal(formatItemNumber(v as number), null);
    assert.equal(formatOutfitNumber(v as number), null);
  }
});

test("outfit numbers are labelled separately from item numbers", () => {
  assert.equal(formatOutfitNumber(2), "Outfit #002");
  assert.notEqual(formatOutfitNumber(2), formatItemNumber(2));
});

test("someone else's item or outfit carries the owner's name", () => {
  assert.equal(itemReference(12, "Maya"), "Maya · #012");
  assert.equal(itemReference(12), "#012");
  assert.equal(outfitReference(4, "Maya"), "Maya's Outfit #004");
  assert.equal(outfitReference(4), "Outfit #004");
  assert.equal(itemReference(null, "Maya"), null);
});

test("typed references are read for search", () => {
  assert.equal(parseItemNumber("#008"), 8);
  assert.equal(parseItemNumber("#8"), 8);
  assert.equal(parseItemNumber(" item #14 "), 14);
  assert.equal(parseItemNumber("item 14"), 14);
  assert.equal(parseItemNumber("8"), null); // plain numbers stay ordinary search text
  assert.equal(parseItemNumber("#0"), null);
  assert.equal(parseItemNumber("red #8 dress"), null);
});
