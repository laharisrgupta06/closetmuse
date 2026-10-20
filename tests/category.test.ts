// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { getNormalizedCategory, inferCategoryFromText } from "../src/utils/category.ts";

const cat = (category: string, subcategory: string, name: string) =>
  getNormalizedCategory({ category, subcategory, name });

test("bags are always Bags, including when filed under Accessories", () => {
  assert.equal(cat("Accessories", "Handbag", "Green Leather Handbag"), "bags");
  assert.equal(cat("accessories", "", "Hobo Bag"), "bags");
  assert.equal(cat("accessories", "Tote", "Canvas Tote"), "bags");
  assert.equal(cat("Bags", "Clutch", "Gold Clutch"), "bags");
  assert.equal(cat("other", "", "Embroidered Potli"), "bags");
});

test("jewellery is always Jewellery, including when filed under Accessories", () => {
  assert.equal(cat("accessories", "Jhumkas", "Gold Jhumkas"), "jewellery");
  assert.equal(cat("Accessories", "", "Pearl Necklace"), "jewellery");
  assert.equal(cat("Jewellery", "Earrings", "Gold Jhumka Earrings"), "jewellery");
});

test("specific stored categories are never overridden", () => {
  assert.equal(cat("bottoms", "", "Baggy Jeans"), "bottoms");
  assert.equal(cat("tops", "", "Herringbone Shirt"), "tops");
  assert.equal(cat("outerwear", "", "Bag-print Jacket"), "outerwear");
  assert.equal(cat("dresses", "Saree", "Red Banarasi Saree"), "dresses");
});

test("audit regressions: substrings no longer misclassify", () => {
  assert.equal(cat("Clothing", "", "Baggy Jeans"), "bottoms");
  assert.equal(cat("Clothing", "", "Bootcut Jeans"), "bottoms");
  assert.equal(cat("Clothing", "", "Spring Floral Dress"), "dresses");
  assert.equal(cat("Clothing", "", "Herringbone Blazer"), "outerwear");
  assert.equal(cat("Clothing", "", "Studded Denim Jacket"), "outerwear");
  assert.equal(cat("Clothing", "", "Dress Shirt"), "tops");
  assert.equal(cat("Clothing", "", "Flat-front Trousers"), "bottoms");
  assert.equal(cat("Clothing", "", "String Top"), "tops");
});

test("Gemini major categories map onto app categories", () => {
  assert.equal(cat("Footwear", "Sneakers", "White Sneakers"), "footwear");
  assert.equal(cat("Footwear", "", ""), "footwear");
  assert.equal(cat("Clothing", "Saree", "Traditional Silk Saree"), "dresses");
  assert.equal(cat("Clothing", "Sherwani", "Traditional White Sherwani"), "tops");
  assert.equal(cat("Clothing", "Blouse", "Beige Embroidered Blouse"), "tops");
  assert.equal(cat("Clothing", "Kurti", "Cotton Kurti"), "tops");
  assert.equal(cat("Accessories", "Belt", "Leather Belt"), "accessories");
  assert.equal(cat("Accessories", "Sunglasses", "Aviators"), "accessories");
  assert.equal(cat("Other", "Hanger", "Red Clothes Hanger"), "other");
  assert.equal(cat("Clothing", "", "Mystery Garment"), "other");
});

test("subcategory is preferred over the name", () => {
  assert.equal(cat("Clothing", "Jeans", "Dress-up Denim"), "bottoms");
  assert.equal(cat("Accessories", "Shoulder Bag", "Chain Strap Bag"), "bags");
});

test("head noun wins; 'with'/'for' phrases are ignored", () => {
  assert.equal(inferCategoryFromText("Shirt Dress"), "dresses");
  assert.equal(inferCategoryFromText("Dress Shirt"), "tops");
  assert.equal(inferCategoryFromText("Kurta with Dupatta"), "tops");
  assert.equal(inferCategoryFromText("Pouch for Earrings"), "bags");
  assert.equal(inferCategoryFromText("Graphic T-Shirt"), "tops");
  assert.equal(inferCategoryFromText("One-piece Swimsuit"), "dresses");
  assert.equal(inferCategoryFromText("Sling Bag"), "bags");
  assert.equal(inferCategoryFromText("Slingback Heels"), "footwear");
});

test("plurals match, unrelated words do not", () => {
  assert.equal(inferCategoryFromText("Gold Bangles"), "jewellery");
  assert.equal(inferCategoryFromText("Black Boots"), "footwear");
  assert.equal(inferCategoryFromText("Ballet Flats"), "footwear");
  assert.equal(inferCategoryFromText("Capelet"), null);
  assert.equal(inferCategoryFromText("Landscape print"), null);
  assert.equal(inferCategoryFromText(""), null);
});

test("legacy stored values and aliases still work", () => {
  assert.equal(cat("jewelry", "", "Ring"), "jewellery");
  assert.equal(cat("shoes", "", ""), "footwear");
  assert.equal(cat("other", "", ""), "other");
  assert.equal(cat("accessories", "", "Hair accessory"), "accessories");
  assert.equal(cat("", "", ""), "other");
});
