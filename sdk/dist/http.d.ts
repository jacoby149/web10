/**
 * HTTP transport layer using native fetch.
 */
/**
 * Error thrown by the SDK when an API call fails.
 */
export declare class Web10Error extends Error {
    status: number;
    details?: string;
    constructor(message: string, status: number, details?: string);
}
/**
 * Perform a POST request.
 */
export declare function authPost<T>(url: string, body: Record<string, unknown>): Promise<T>;
//# sourceMappingURL=http.d.ts.map