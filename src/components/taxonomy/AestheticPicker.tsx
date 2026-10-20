import { AESTHETICS, normalizeAesthetic } from "../../utils/taxonomy";

interface AestheticPickerProps {
  /** Stored style_branch value, possibly legacy ("Unknown") */
  value: string;
  onChange: (value: string) => void;
  labelId: string;
  disabled?: boolean;
}

/**
 * Traditional / Western / Indo-Western, or not set. Choosing the option
 * already shown is a no-op, so a legacy value such as "Unknown" is kept
 * unless the user picks a style.
 */
export default function AestheticPicker({ value, onChange, labelId, disabled }: AestheticPickerProps) {
  const current = normalizeAesthetic(value);
  const options = [...AESTHETICS, null];
  return (
    <div className="filter-chips aesthetic-picker" role="radiogroup" aria-labelledby={labelId}>
      {options.map((opt) => {
        const checked = opt === current;
        return (
          <button
            key={opt ?? "none"}
            type="button"
            role="radio"
            aria-checked={checked}
            className={`filter-chip${checked ? " active" : ""}`}
            data-aesthetic={opt ?? "none"}
            disabled={disabled}
            onClick={() => !checked && onChange(opt ?? "")}
          >
            {opt ?? "Not set"}
          </button>
        );
      })}
    </div>
  );
}
