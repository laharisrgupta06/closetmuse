/**
 * What has to change for a room's shares (by the signed-in user) to become
 * exactly `wanted`: items to add and items to stop sharing. Duplicates in
 * `wanted` are ignored; order follows the inputs.
 */
export function planShareChanges(
  existing: Iterable<string>,
  wanted: Iterable<string>
): { toAdd: string[]; toRemove: string[] } {
  const current = new Set(existing);
  const target = new Set(wanted);
  return {
    toAdd: [...target].filter((id) => !current.has(id)),
    toRemove: [...current].filter((id) => !target.has(id)),
  };
}
