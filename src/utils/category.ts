import type { GarmentCategory } from "../types";

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
  "pendant",
  "brooch",
  "anklet",
  "tikka",
  "chain",
  "kada",
  "payal",
  "stud",
];

export const FOOTWEAR_KEYWORDS = [
  "shoe",
  "sneaker",
  "boot",
  "sandal",
  "heel",
  "loafer",
  "flat",
  "mule",
  "slipper",
  "footwear",
  "oxford",
  "pump",
  "wedge",
  "mojri",
  "jutti",
  "kolhapuri",
];

export const DRESS_KEYWORDS = [
  "saree",
  "sari",
  "dress",
  "gown",
  "lehenga",
  "anarkali",
  "skirt",
  "jumpsuit",
  "romper",
  "one-piece",
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
  "dhoti",
  "pyjama",
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
  "t-shirt",
  "tee",
  "blouse",
  "kurti",
  "kurta",
  "camisole",
  "tank",
  "tunic",
  "polo",
  "crop",
];

/**
 * Normalizes an item's category using its category, subcategory, name, or metadata.
 * Ensures consistent taxonomy across Build, Closet, Outfit Builder, and AI Stylist.
 *
 * Guaranteed rules:
 * - Handbags, hobo bags, totes, clutches ALWAYS classify as 'bags'.
 * - Earrings, necklaces, bangles, rings ALWAYS classify as 'jewellery'.
 * - Footwear ALWAYS classifies as 'footwear'.
 * - Never leaves handbags stranded under accessories or generic other.
 */
export function getNormalizedCategory(item: {
  category?: string;
  subcategory?: string;
  name?: string;
}): GarmentCategory {
  const cat = (item.category || "").toLowerCase().trim();
  const sub = (item.subcategory || "").toLowerCase().trim();
  const name = (item.name || "").toLowerCase().trim();
  const fullText = `${sub} ${name} ${cat}`;

  // 1. Bags - highest priority to prevent bags being trapped under accessories
  if (
    cat === "bags" ||
    cat === "bag" ||
    BAG_KEYWORDS.some((k) => fullText.includes(k))
  ) {
    return "bags";
  }

  // 2. Jewellery - prevent jewellery being trapped under accessories
  if (
    cat === "jewellery" ||
    cat === "jewelry" ||
    JEWELLERY_KEYWORDS.some((k) => fullText.includes(k))
  ) {
    return "jewellery";
  }

  // 3. Footwear
  if (
    cat === "footwear" ||
    cat === "shoes" ||
    cat === "shoe" ||
    FOOTWEAR_KEYWORDS.some((k) => fullText.includes(k))
  ) {
    return "footwear";
  }

  // 4. Dresses / Ethnic Sets
  if (
    cat === "dresses" ||
    cat === "dress" ||
    DRESS_KEYWORDS.some((k) => fullText.includes(k))
  ) {
    return "dresses";
  }

  // 5. Bottoms
  if (
    cat === "bottoms" ||
    cat === "bottom" ||
    BOTTOM_KEYWORDS.some((k) => fullText.includes(k))
  ) {
    return "bottoms";
  }

  // 6. Outerwear
  if (
    cat === "outerwear" ||
    OUTERWEAR_KEYWORDS.some((k) => fullText.includes(k))
  ) {
    return "outerwear";
  }

  // 7. Tops
  if (
    cat === "tops" ||
    cat === "top" ||
    TOP_KEYWORDS.some((k) => fullText.includes(k))
  ) {
    return "tops";
  }

  // 8. Accessories (belts, scarves, sunglasses, hats, etc.)
  if (cat === "accessories" || cat === "accessory") {
    return "accessories";
  }

  // Known fallback
  if (
    ["tops", "bottoms", "dresses", "outerwear", "footwear", "bags", "jewellery", "accessories", "other"].includes(
      cat
    )
  ) {
    return cat as GarmentCategory;
  }

  return "other";
}
