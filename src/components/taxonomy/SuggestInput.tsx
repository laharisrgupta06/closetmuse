import { useEffect, useId, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";

export interface SuggestOption {
  value: string;
  /** Other words that should find this option ("jhumki" → Jhumkas) */
  keywords?: string[];
  /** Extra data passed back on pick */
  meta?: string;
}

export interface SuggestGroup {
  label: string;
  options: SuggestOption[];
}

interface SuggestInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Called when a suggestion (not free text) is chosen */
  onPick?: (option: SuggestOption) => void;
  groups: SuggestGroup[];
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  describedBy?: string;
  /** Text of the "keep what I typed" row */
  customLabel: (value: string) => string;
}

type Row = { kind: "custom" } | { kind: "option"; option: SuggestOption; group: string; firstInGroup: boolean };

/**
 * Text input with grouped suggestions. Typing always keeps the typed text,
 * so users can pick a curated value or enter their own.
 */
export default function SuggestInput({
  id,
  value,
  onChange,
  onPick,
  groups,
  placeholder,
  disabled,
  maxLength = 80,
  describedBy,
  customLabel,
}: SuggestInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const rows = useMemo<Row[]>(() => {
    const q = value.trim().toLowerCase();
    const all = groups.flatMap((g) => g.options.map((option) => ({ option, group: g.label })));
    const exact = all.some((r) => r.option.value.toLowerCase() === q);
    const words = q.split(/\s+/);
    const shown = !q || exact
      ? all
      : all.filter((r) => {
          const text = [r.option.value, ...(r.option.keywords ?? [])].join(" ").toLowerCase();
          return words.every((w) => text.includes(w));
        });
    const options: Row[] = shown.map((r, i) => ({
      kind: "option",
      ...r,
      firstInGroup: i === 0 || shown[i - 1].group !== r.group,
    }));
    return !q || exact ? options : [{ kind: "custom" }, ...options];
  }, [groups, value]);

  useEffect(() => {
    if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  const choose = (row: Row) => {
    if (row.kind === "option") {
      onChange(row.option.value);
      onPick?.(row.option);
    }
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && active >= 0 && rows[active]) {
      e.preventDefault(); // pick, don't submit the form
      choose(rows[active]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="suggest">
      <input
        id={id}
        className="form-input suggest-input"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && rows.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {open && rows.length > 0 && !disabled && (
        <ul className="suggest-list" id={listId} role="listbox">
          {rows.map((row, i) => {
            const header = row.kind === "option" && row.firstInGroup ? row.group : null;
            return (
              <li key={row.kind === "custom" ? "__custom" : `${row.group}/${row.option.value}`} role="presentation">
                {header && <div className="suggest-group" role="presentation">{header}</div>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`suggest-option${i === active ? " active" : ""}${row.kind === "custom" ? " custom" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(row)}
                  onMouseEnter={() => setActive(i)}
                >
                  {row.kind === "custom" ? customLabel(value.trim()) : row.option.value}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
