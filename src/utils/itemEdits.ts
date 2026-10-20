// Pure helpers for saving wardrobe edits without touching fields the user
// didn't change.

export const EDITABLE_FIELDS = [
  "name",
  "category",
  "style_branch",
  "subcategory",
  "color",
  "material",
  "pattern",
  "occasion",
  "style",
  "brand",
  "notes",
  "design_tradition",
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type ItemFormValues = Record<EditableField, string>;
export type ItemChanges = Partial<Record<EditableField, string | null>>;

/** Form values as first shown for a stored item (missing values become "") */
export function formValuesFrom(item: Partial<Record<EditableField, string | null | undefined>>): ItemFormValues {
  const out = {} as ItemFormValues;
  for (const f of EDITABLE_FIELDS) out[f] = item[f] ?? "";
  return out;
}

/**
 * Only the fields the user changed, compared with what the form first
 * showed. Untouched fields are never sent, so stored values (including
 * legacy ones such as "Unknown" or a category the form displays
 * differently) are kept exactly. A cleared field becomes null.
 */
export function diffItemForm(initial: ItemFormValues, next: ItemFormValues): ItemChanges {
  const changes: ItemChanges = {};
  for (const f of EDITABLE_FIELDS) {
    if (next[f].trim() === initial[f].trim()) continue;
    const value = next[f].trim();
    if (f === "name" && !value) continue; // name is required; never cleared
    changes[f] = value || null;
  }
  return changes;
}

/** Columns added by later migrations; saves retry without them if absent */
export const OPTIONAL_COLUMNS = ["original_image_url", "design_tradition"] as const;

/**
 * The optional column a PostgREST error says is missing, if any:
 *   PGRST204 "Could not find the 'design_tradition' column of 'wardrobe_items' in the schema cache"
 *   42703    "column wardrobe_items.design_tradition does not exist"
 */
export function missingOptionalColumn(error: { code?: string; message?: string } | null | undefined): string | null {
  if (!error || (error.code !== "PGRST204" && error.code !== "42703")) return null;
  const msg = error.message ?? "";
  const name =
    /'([a-z_]+)' column/.exec(msg)?.[1] ?? /column (?:[a-z_]+\.)?"?([a-z_]+)"? does not exist/.exec(msg)?.[1];
  return name && (OPTIONAL_COLUMNS as readonly string[]).includes(name) ? name : null;
}
