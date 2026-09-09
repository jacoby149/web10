/**
 * HTTP transport layer using native fetch.
 */
/**
 * Error thrown by the SDK when an API call fails.
 *
 * `message` is the human-readable reason — the API's `detail` when it carries
 * one (FastAPI `HTTPException(detail=…)` → `{"detail": "…"}`), else the status
 * line. `details` keeps the raw response body for the console/debug.
 */
export declare class Web10Error extends Error {
    status: number;
    details?: string;
    constructor(message: string, status: number, details?: string);
}
/**
 * Extract the human-readable reason from a FastAPI error body.
 *
 * The node raises `HTTPException(status_code, detail=…)`, which FastAPI
 * serializes as `{"detail": "…"}`. `detail` is a string for every auth /
 * permission / not-found error — the one thing that tells the user *exactly*
 * what went wrong ("No app contract for … to create on …", "not a member of
 * the requested group", "invalid credentials"). A 422 validation error carries
 * an array of field errors instead; we fold those into one line. When the body
 * is not JSON (a proxy, an empty 502, …) we return null and the caller falls
 * back to the status line.
 */
export declare function extractDetail(text: string): string | null;
/**
 * Perform a POST request.
 */
export declare function authPost<T>(url: string, body: Record<string, unknown>): Promise<T>;
//# sourceMappingURL=http.d.ts.map