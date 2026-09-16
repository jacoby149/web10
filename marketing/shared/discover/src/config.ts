// The API origin the player prepends to path-only HLS manifest URLs. Each
// consuming app injects its API origin at build — but under a DIFFERENT env
// var (marketing-ui: VITE_API_URL; web10-social: VITE_API_ORIGIN — see each
// app's src/lib/origins.ts). Read both so the shared player resolves the right
// origin per app. Falls back to production so a plain build with no args still
// targets prod.

const env = (import.meta as any).env as Record<string, string | undefined> | undefined;

export const API_ORIGIN: string =
  env?.VITE_API_URL || env?.VITE_API_ORIGIN || 'https://api.web10.app';
