import { useMemo } from "react";
import SuggestInput from "./SuggestInput";
import type { SuggestGroup } from "./SuggestInput";
import { AESTHETICS, DESIGN_TRADITIONS } from "../../utils/taxonomy";
import type { Aesthetic } from "../../utils/taxonomy";

interface TraditionInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** The item's aesthetic; its traditions are listed first */
  aesthetic: Aesthetic | null;
  /** false before migration 008: the column doesn't exist, so nothing can be saved */
  available: boolean | null;
}

/** Optional jewellery design tradition (Kundan, Polki, Minimalist…) */
export default function TraditionInput({ id, value, onChange, aesthetic, available }: TraditionInputProps) {
  const groups = useMemo<SuggestGroup[]>(() => {
    const order = aesthetic ? [aesthetic, ...AESTHETICS.filter((a) => a !== aesthetic)] : [...AESTHETICS];
    return order.map((a) => ({ label: a, options: DESIGN_TRADITIONS[a].map((t) => ({ value: t })) }));
  }, [aesthetic]);

  if (available === false) {
    return (
      <>
        <input id={id} className="form-input" disabled value="" placeholder="Not available yet" aria-describedby={`${id}-hint`} />
        <p className="field-hint" id={`${id}-hint`}>
          Saving a design tradition needs database update 008, which hasn’t been applied yet.
        </p>
      </>
    );
  }

  return (
    <>
      <SuggestInput
        id={id}
        value={value}
        onChange={onChange}
        groups={groups}
        placeholder="Optional, e.g. Kundan, Polki, Minimalist"
        disabled={available === null}
        describedBy={`${id}-hint`}
        customLabel={(v) => `Use “${v}” as typed`}
      />
      <p className="field-hint" id={`${id}-hint`}>
        {available === null ? "Checking…" : "Optional. Pick one or type your own."}
      </p>
    </>
  );
}
