// Display of the permanent numbers assigned by the database (migration 009).
// Numbers are never computed here: an item or outfit without a stored number
// (before the migration, or an unsaved outfit) simply shows none.

const pad = (n: number) => String(n).padStart(3, "0");
const valid = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

/** "#012" for a wardrobe item, or null when the item has no number yet */
export function formatItemNumber(n: number | null | undefined): string | null {
  return valid(n) ? `#${pad(n)}` : null;
}

/** "Outfit #004", or null when the outfit has no number yet */
export function formatOutfitNumber(n: number | null | undefined): string | null {
  return valid(n) ? `Outfit #${pad(n)}` : null;
}

/**
 * How to name someone else's item where numbers could clash between owners:
 * "Maya · #012". Your own items (owner omitted) are just "#012".
 */
export function itemReference(n: number | null | undefined, ownerName?: string | null): string | null {
  const num = formatItemNumber(n);
  if (!num) return null;
  return ownerName ? `${ownerName} · ${num}` : num;
}

/** "Maya's Outfit #004" or "Outfit #004" */
export function outfitReference(n: number | null | undefined, ownerName?: string | null): string | null {
  const num = formatOutfitNumber(n);
  if (!num) return null;
  return ownerName ? `${ownerName}'s ${num}` : num;
}

/**
 * Reads an item reference typed by a user ("#8", "#008", "item 12") as a
 * number, for search. Returns null for anything else.
 */
export function parseItemNumber(text: string): number | null {
  const m = /^\s*(?:item\s*)?#\s*0*(\d{1,6})\s*$/i.exec(text) ?? /^\s*item\s+0*(\d{1,6})\s*$/i.exec(text);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}
