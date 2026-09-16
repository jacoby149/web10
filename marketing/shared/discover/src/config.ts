// The API origin the player prepends to path-only HLS manifest URLs. Both
// consuming apps inject VITE_API_URL at build (the same env var their own
// origins.ts reads), so the shared player resolves the right origin per app.
// Falls back to production so a plain build with no args still targets prod.

const env = (import.meta as any).env as Record<string, string | undefined> | undefined;

export const API_ORIGIN: string = env?.VITE_API_URL || 'https://api.web10.app';
