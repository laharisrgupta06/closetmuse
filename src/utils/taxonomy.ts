// Wardrobe taxonomy lives with the Edge Functions so AI classification and
// the app use the same item types and aesthetics.
export {
  AESTHETICS,
  TAXONOMY,
  DESIGN_TRADITIONS,
  ALL_DESIGN_TRADITIONS,
  categoryTaxonomy,
  typesFor,
  typeById,
  otherType,
  resolveItemType,
  normalizeAesthetic,
} from "../../supabase/functions/_shared/taxonomy.ts";
export type { Aesthetic, ItemType, TypeGroup, CategoryTaxonomy } from "../../supabase/functions/_shared/taxonomy.ts";
