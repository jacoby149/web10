/**
 * The text-tile palette (design.md §13) — the deep, brand-tinted backgrounds a
 * text-only post (or a saved-collection cover) renders on. A post/collection
 * picks one **deterministically** (hash of its id → the same `hashToColor`
 * idiom the avatar fallbacks use), so a given id always gets the same color
 * (stable across renders / devices) and the wall reads as a designed set of
 * cards, not a wall of empty black boxes. The CSS var (not a raw hex) keeps it
 * token-based.
 */
const TEXT_TILE_COLORS = [
  'var(--color-tile-violet)',
  'var(--color-tile-indigo)',
  'var(--color-tile-fuchsia)',
  'var(--color-tile-blue)',
  'var(--color-tile-teal)',
  'var(--color-tile-rose)',
] as const;

export function textTileColor(id?: string): string {
  if (!id) return TEXT_TILE_COLORS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return TEXT_TILE_COLORS[Math.abs(h) % TEXT_TILE_COLORS.length];
}
