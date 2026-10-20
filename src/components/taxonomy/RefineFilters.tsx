import { useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { AESTHETICS } from "../../utils/taxonomy";
import { CATEGORY_DEFINITIONS } from "../../utils/category";
import { aestheticCounts, itemFacets, typeCounts, NO_REFINE, isRefined } from "../../utils/wardrobeFilter";
import type { FilterableItem, RefineValue } from "../../utils/wardrobeFilter";
import type { GarmentCategory } from "../../utils/category";

interface RefineFiltersProps {
  /** Items in the current category, used for the counts and choices */
  items: FilterableItem[];
  category: GarmentCategory | "all";
  value: RefineValue;
  onChange: (value: RefineValue) => void;
  /** Prefix for element ids when a page shows more than one */
  idPrefix?: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Secondary filters, shown below the main category chips.
 * - "All": collapsed behind a Filters button offering the general filters
 *   (aesthetic, occasion); it opens by itself whenever one of them is set,
 *   so nothing is ever filtered out of sight.
 * - A category: a panel just for that category: its item types, aesthetic,
 *   occasion, and design tradition for jewellery.
 */
export default function RefineFilters({ items, category, value, onChange, idPrefix = "filter" }: RefineFiltersProps) {
  const [generalOpen, setGeneralOpen] = useState(false);
  const styles = useMemo(() => aestheticCounts(items), [items]);
  const types = useMemo(() => (category === "all" ? [] : typeCounts(items, category)), [items, category]);
  const traditions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      const t = itemFacets(item).tradition;
      if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [items]);
  const occasions = useMemo(
    () => [...new Set(items.map((i) => (i.occasion ?? "").trim().toLowerCase()).filter(Boolean))].sort(),
    [items]
  );

  const set = (patch: Partial<RefineValue>) => onChange({ ...value, ...patch });
  const generalActive = value.aesthetic !== "all" || value.occasion !== "all";
  const isAll = category === "all";
  const open = !isAll || generalOpen || generalActive;
  const label = CATEGORY_DEFINITIONS.find((c) => c.value === category)?.label ?? "";
  const panelId = `${idPrefix}-panel`;

  const styleChips: { key: RefineValue["aesthetic"]; label: string; count?: number }[] = [
    { key: "all", label: "Any" },
    ...AESTHETICS.map((a) => ({ key: a, label: a, count: styles[a] })),
    ...(styles.unspecified > 0 || value.aesthetic === "unspecified"
      ? [{ key: "unspecified" as const, label: "Not set", count: styles.unspecified }]
      : []),
  ];
  const activeTypeId = types.some((t) => t.type.id === value.typeId) ? value.typeId : "all";
  const activeTradition = traditions.find((t) => t.toLowerCase() === value.tradition.toLowerCase()) ?? "all";

  return (
    <div className={`refine-filters${open ? " is-open" : ""}`} data-refine-for={category}>
      {isAll && (
        <button
          type="button"
          className={`btn btn-ghost btn-sm refine-toggle${open ? " active" : ""}`}
          aria-expanded={open}
          aria-controls={panelId}
          id={`${idPrefix}-toggle`}
          onClick={() => {
            // Closing also clears the general filters, so nothing stays applied out of sight
            if (open) {
              setGeneralOpen(false);
              if (generalActive) onChange({ ...value, aesthetic: "all", occasion: "all" });
            } else setGeneralOpen(true);
          }}
        >
          <SlidersHorizontal size={13} />
          Filters{generalActive ? ` (${Number(value.aesthetic !== "all") + Number(value.occasion !== "all")})` : ""}
        </button>
      )}

      {open && (
        <div className="refine-panel" id={panelId} role="group" aria-label={isAll ? "Filter all items" : `Refine ${label}`}>
          <div className="refine-title">{isAll ? "Filter all items" : `Refine ${label}`}</div>

          {!isAll && items.length === 0 && <p className="field-hint">No {label.toLowerCase()} in this wardrobe yet.</p>}

          {!isAll && types.length > 0 && (
            <div className="refine-row">
              <span className="refine-label">Type</span>
              <div className="filter-chips" role="group" aria-label={`${label} type`}>
                <button
                  type="button"
                  className={`filter-chip filter-chip-sm${activeTypeId === "all" ? " active" : ""}`}
                  aria-pressed={activeTypeId === "all"}
                  data-type-filter="all"
                  onClick={() => set({ typeId: "all" })}
                >
                  All {label.toLowerCase()}
                </button>
                {types.map(({ type, count }) => (
                  <button
                    key={type.id}
                    type="button"
                    className={`filter-chip filter-chip-sm${activeTypeId === type.id ? " active" : ""}`}
                    aria-pressed={activeTypeId === type.id}
                    data-type-filter={type.id}
                    onClick={() => set({ typeId: type.id })}
                  >
                    {type.label}
                    <span className="chip-count">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="refine-row">
              <span className="refine-label">Aesthetic</span>
              <div className="filter-chips" role="group" aria-label="Filter by aesthetic">
                {styleChips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`filter-chip filter-chip-sm${value.aesthetic === c.key ? " active" : ""}${c.count === 0 ? " is-empty" : ""}`}
                    aria-pressed={value.aesthetic === c.key}
                    data-style-filter={c.key}
                    onClick={() => set({ aesthetic: c.key })}
                  >
                    {c.label}
                    {c.count !== undefined && <span className="chip-count">{c.count}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {category === "jewellery" && traditions.length > 0 && (
            <div className="refine-row">
              <span className="refine-label">Tradition</span>
              <div className="filter-chips" role="group" aria-label="Filter by design tradition">
                <button
                  type="button"
                  className={`filter-chip filter-chip-sm${activeTradition === "all" ? " active" : ""}`}
                  aria-pressed={activeTradition === "all"}
                  data-tradition-filter="all"
                  onClick={() => set({ tradition: "all" })}
                >
                  Any
                </button>
                {traditions.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`filter-chip filter-chip-sm${activeTradition === t ? " active" : ""}`}
                    aria-pressed={activeTradition === t}
                    data-tradition-filter={t}
                    onClick={() => set({ tradition: t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(occasions.length > 0 || isRefined(value)) && (
            <div className="refine-row refine-row-end">
              {occasions.length > 0 && (
                <select
                  id={`${idPrefix}-occasion`}
                  className="form-select refine-select"
                  aria-label="Filter by occasion"
                  value={occasions.includes(value.occasion.toLowerCase()) ? value.occasion.toLowerCase() : "all"}
                  onChange={(e) => set({ occasion: e.target.value })}
                >
                  <option value="all">Any occasion</option>
                  {occasions.map((o) => (
                    <option key={o} value={o}>
                      {cap(o)}
                    </option>
                  ))}
                </select>
              )}
              {isRefined(value) && (
                <button type="button" className="btn btn-ghost btn-sm refine-clear" onClick={() => onChange(NO_REFINE)}>
                  <X size={12} /> Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
