/**
 * HTTP transport layer using native fetch.
 *
 * Replaces the legacy axios dependency. All requests go through this
 * module so they can be mocked in tests and configured centrally.
 */

import type {
  CreateResponse,
  UpdateResponse,
  DeleteResponse,
  Pipeline,
} from './types'

/**
 * Internal request body for CRUD operations.
 */
interface CrudBody {
  token: string | null
  query?: Record<string, unknown> | null
  update?: Record<string, unknown> | null
}

/**
 * Make a web10 API request using native fetch.
 *
 * @param method - HTTP method
 * @param url - Full URL
 * @param body - Request body
 * @returns Parsed JSON response
 */
async function request<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Web10Error(
      `Request failed: ${res.status} ${res.statusText}`,
      res.status,
      text,
    )
  }
  return res.json() as Promise<T>
}

/**
 * Error thrown by the SDK when an API call fails.
 */
export class Web10Error extends Error {
  status: number
  details?: string

  constructor(message: string, status: number, details?: string) {
    super(message)
    this.name = 'Web10Error'
    this.status = status
    this.details = details
  }
}

/**
 * Perform a POST request (used for all CRUD operations).
 * All v2 CRUD endpoints are now POST with path suffixes:
 * /{user}/{service}/read, /update, /delete.
 */
export async function post<T>(url: string, body: CrudBody): Promise<T> {
  return request<T>('POST', url, body)
}

/**
 * Perform an aggregate POST request.
 */
export async function aggregate<T>(
  url: string,
  body: { token: string | null; pipeline: Pipeline },
): Promise<T[]> {
  return request<T[]>('POST', url, body)
}

/**
 * Perform a POST to an auth endpoint (login, signup, etc.).
 */
export async function authPost<T>(url: string, body: Record<string, unknown>): Promise<T> {
  return request<T>('POST', url, body)
}
