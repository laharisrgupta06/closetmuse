// Pure filtering for wardrobe lists (Closet, Outfit Builder picker, member
// wardrobes). Category, item type, aesthetic and design tradition are
// independent filters that combine with AND.
import { CATEGORY_DEFINITIONS, getNormalizedCategory, type GarmentCategory } from "./category.ts";
import { normalizeAesthetic, resolveItemType, typesFor, type Aesthetic, type ItemType } from "./taxonomy.ts";

export interface FilterableItem {
  name: string;
  category?: string;
  subcategory?: string | null;
  style_branch?: string | null;
  design_tradition?: string | null;
  color?: string | null;
  material?: string | null;
  occasion?: string | null;
}

export interface WardrobeFilter {
  category?: GarmentCategory | "all";
  /** "unspecified" finds items with no aesthetic yet, so they can be corrected */
  aesthetic?: Aesthetic | "unspecified" | "all";
  /** An ItemType id ("jewellery:jhumkas") */
  typeId?: string | "all";
  tradition?: string | "all";
  /** Stored occasion value ("formal", "occasion"…) */
  occasion?: string | "all";
  query?: string;
}

/** The style / type / tradition part of a filter, as the filter row edits it */
export interface RefineValue {
  aesthetic: Aesthetic | "unspecified" | "all";
  typeId: string;
  tradition: string;
  occasion: string;
}

export const NO_REFINE: RefineValue = { aesthetic: "all", typeId: "all", tradition: "all", occasion: "all" };

/** Whether any of the style / type / tradition / occasion filters is set */
export const isRefined = (r: RefineValue) =>
  r.aesthetic !== "all" || r.typeId !== "all" || r.tradition !== "all" || r.occasion !== "all";

export interface ItemFacets {
  category: GarmentCategory;
  type: ItemType;
  aesthetic: Aesthetic | null;
  tradition: string | null;
}

/** How an item is classified on each dimension; stored values are only read */
export function itemFacets(item: FilterableItem): ItemFacets {
  const category = getNormalizedCategory({
    category: item.category,
    subcategory: item.subcategory ?? undefined,
    name: item.name,
  });
  return {
    category,
    type: resolveItemType(category, item.subcategory, item.name),
    aesthetic: normalizeAesthetic(item.style_branch),
    tradition: item.design_tradition?.trim() || null,
  };
}

const active = (v: string | undefined) => Boolean(v) && v !== "all";

export function matchesFilter(item: FilterableItem, filter: WardrobeFilter, facets = itemFacets(item)): boolean {
  if (active(filter.category) && facets.category !== filter.category) return false;
  if (active(filter.aesthetic)) {
    if (filter.aesthetic === "unspecified" ? facets.aesthetic !== null : facets.aesthetic !== filter.aesthetic) {
      return false;
    }
  }
  if (active(filter.typeId) && facets.type.id !== filter.typeId) return false;
  if (active(filter.tradition) && facets.tradition?.toLowerCase() !== filter.tradition!.toLowerCase()) return false;
  if (active(filter.occasion) && (item.occasion ?? "").toLowerCase() !== filter.occasion!.toLowerCase()) return false;

  const words = (filter.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) {
    const haystack = [
      item.name,
      item.subcategory,
      item.color,
      item.material,
      item.occasion,
      facets.category,
      facets.type.label,
      facets.aesthetic,
      facets.tradition,
    ]
      .filter(Boolean)
      .join(" \u0000 ")
      .toLowerCase();
    // Every word must appear somewhere: "red saree" finds "Red Banarasi Saree"
    if (!words.every((w) => haystack.includes(w))) return false;
  }
  return true;
}

export function filterWardrobe<T>(items: T[], filter: WardrobeFilter, pick: (x: T) => FilterableItem): T[] {
  return items.filter((x) => matchesFilter(pick(x), filter));
}

/**
 * Item types present in a list for one category, with counts, in taxonomy
 * order, so type chips only offer choices that return results.
 */
export function typeCounts(items: FilterableItem[], category: GarmentCategory): { type: ItemType; count: number }[] {
  const counts = new Map<string, { type: ItemType; count: number }>();
  for (const item of items) {
    const f = itemFacets(item);
    if (f.category !== category) continue;
    const entry = counts.get(f.type.id) ?? { type: f.type, count: 0 };
    entry.count++;
    counts.set(f.type.id, entry);
  }
  const order = typesFor(category).map((t) => t.id);
  return [...counts.values()].sort((a, b) => order.indexOf(a.type.id) - order.indexOf(b.type.id));
}

/** Counts per aesthetic (and unspecified) for the aesthetic chips */
export function aestheticCounts(items: FilterableItem[]): Record<Aesthetic | "unspecified", number> {
  const out: Record<Aesthetic | "unspecified", number> = {
    Traditional: 0,
    Western: 0,
    "Indo-Western": 0,
    unspecified: 0,
  };
  for (const item of items) out[normalizeAesthetic(item.style_branch) ?? "unspecified"]++;
  return out;
}

export type WardrobeSort = "newest" | "oldest" | "name" | "category";

export const WARDROBE_SORTS: { value: WardrobeSort; label: string }[] = [
  { value: "newest", label: "Newest added" },
  { value: "oldest", label: "Oldest added" },
  { value: "name", label: "Name A–Z" },
  { value: "category", label: "Category" },
];

/** A sorted copy; ties keep a stable, predictable order (by name) */
export function sortWardrobe<T extends FilterableItem & { created_at?: string }>(items: T[], sort: WardrobeSort): T[] {
  const order = CATEGORY_DEFINITIONS.map((c) => c.value as string);
  const time = (x: T) => (x.created_at ? Date.parse(x.created_at) : 0);
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return [...items].sort((a, b) => {
    if (sort === "name") return byName(a, b);
    if (sort === "category") {
      return order.indexOf(itemFacets(a).category) - order.indexOf(itemFacets(b).category) || byName(a, b);
    }
    const diff = time(b) - time(a);
    return (sort === "newest" ? diff : -diff) || byName(a, b);
  });
}
