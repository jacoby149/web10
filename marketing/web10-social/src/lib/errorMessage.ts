/**
 * Extract a human-readable reason from an unknown thrown value. Prefers the
 * Error message (the SDK's Web10Error.message is the API's `detail`), falls
 * back to a generic line so a non-Error rejection never shows "undefined".
 *
 * Pure utility — no React, no lucide — so it can be imported anywhere (even
 * from tests that mock lucide-react with a partial icon set) without dragging
 * the toast's icon imports along.
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return fallback;
}
