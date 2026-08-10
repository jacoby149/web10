/**
 * Legacy compatibility shim — re-exports `wapiInit` and `wapiAuthInit`
 * so apps using the old SDK API continue to work against the new typed SDK.
 *
 * Usage (unchanged for consumers):
 *   import { wapiInit, wapiAuthInit } from 'web10-npm'
 */
/**
 * Legacy wapiInit — returns the same shape as the old JS SDK.
 */
export declare function wapiInit(authUrl?: string, appStores?: string[], rtcServer?: string): Record<string, unknown>;
/**
 * Legacy wapiAuthInit — wraps the new auth connector to match the old API.
 */
export declare function wapiAuthInit(wapi: Record<string, unknown>): Record<string, unknown>;
//# sourceMappingURL=compat.d.ts.map