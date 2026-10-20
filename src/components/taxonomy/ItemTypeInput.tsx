import { useMemo } from "react";
import SuggestInput from "./SuggestInput";
import type { SuggestGroup } from "./SuggestInput";
import { TAXONOMY, categoryTaxonomy, resolveItemType } from "../../utils/taxonomy";
import type { Aesthetic } from "../../utils/taxonomy";
import type { GarmentCategory } from "../../utils/category";

/** How many aesthetic-matched types to suggest first */
const SUGGESTED_LIMIT = 8;

interface ItemTypeInputProps {
  id: string;
  /** Empty while the user hasn't chosen a category yet */
  category: GarmentCategory | "";
  value: string;
  onChange: (value: string) => void;
  /** A curated type was picked; its category, for filling an empty category */
  onPickCategory?: (category: GarmentCategory) => void;
  /** The item's aesthetic: its usual types are suggested first, nothing is hidden */
  aesthetic?: Aesthetic | null;
  disabled?: boolean;
}

/** Item type: a curated type for the category, or the user's own words */
export default function ItemTypeInput({ id, category, value, onChange, onPickCategory, aesthetic, disabled }: ItemTypeInputProps) {
  const empty = !value.trim();
  const groups = useMemo<SuggestGroup[]>(() => {
    const cats = category ? [categoryTaxonomy(category)] : TAXONOMY;
    const all = cats.flatMap((c) =>
      c.groups.map((g) => ({
        label: category ? g.label : `${c.label} · ${g.label}`,
        options: g.types.map((t) => ({ value: t.label, keywords: t.aliases, meta: c.category })),
      }))
    );
    // Only while nothing is typed, so a search never lists a type twice
    if (!category || !aesthetic || !empty) return all;
    const suggested = categoryTaxonomy(category)
      .groups.flatMap((g) => g.types)
      .filter((t) => t.typical[0] === aesthetic)
      .slice(0, SUGGESTED_LIMIT)
      .map((t) => ({ value: t.label, keywords: t.aliases, meta: category }));
    return suggested.length ? [{ label: `Suggested for ${aesthetic}`, options: suggested }, ...all] : all;
  }, [category, aesthetic, empty]);

  const text = value.trim();
  let hint = "Choose a type from the list or type your own.";
  if (text && category) {
    const resolved = resolveItemType(category, text);
    if (resolved.label.toLowerCase() === text.toLowerCase()) hint = "";
    else if (resolved.label.startsWith("Other ")) hint = `Your own type. Filters list it under “${resolved.label}”.`;
    else hint = `Filters list it under “${resolved.label}”.`;
  }

  return (
    <>
      <SuggestInput
        id={id}
        value={value}
        onChange={onChange}
        onPick={(o) => o.meta && onPickCategory?.(o.meta as GarmentCategory)}
        groups={groups}
        placeholder="e.g. Saree, Kurti, Jeans, Jhumkas"
        disabled={disabled}
        describedBy={hint ? `${id}-hint` : undefined}
        customLabel={(v) => `Use “${v}” as typed`}
      />
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </>
  );
}
