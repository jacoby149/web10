/**
 * HTTP transport layer using native fetch.
 *
 * Replaces the legacy axios dependency. All requests go through this
 * module so they can be mocked in tests and configured centrally.
 */
import type { Pipeline } from './types';
/**
 * Internal request body for CRUD operations.
 */
interface CrudBody {
    token: string | null;
    query?: Record<string, unknown> | null;
    update?: Record<string, unknown> | null;
}
/**
 * Error thrown by the SDK when an API call fails.
 */
export declare class Web10Error extends Error {
    status: number;
    details?: string;
    constructor(message: string, status: number, details?: string);
}
/**
 * Perform a PATCH request (used for read queries).
 * PATCH is used instead of GET so the body can carry the token and query.
 */
export declare function patch<T>(url: string, body: CrudBody): Promise<T>;
/**
 * Perform a POST request (used for create).
 */
export declare function post<T>(url: string, body: CrudBody): Promise<T>;
/**
 * Perform a PUT request (used for update).
 */
export declare function put<T>(url: string, body: CrudBody): Promise<T>;
/**
 * Perform a DELETE request (used for delete).
 */
export declare function del<T>(url: string, body: CrudBody): Promise<T>;
/**
 * Perform an aggregate POST request.
 */
export declare function aggregate<T>(url: string, body: {
    token: string | null;
    pipeline: Pipeline;
}): Promise<T[]>;
/**
 * Perform a POST to an auth endpoint (login, signup, etc.).
 */
export declare function authPost<T>(url: string, body: Record<string, unknown>): Promise<T>;
export {};
//# sourceMappingURL=http.d.ts.map