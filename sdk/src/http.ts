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
export function extractDetail(text: string): string | null {
  if (!text) return null
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => {
      const item = d as { msg?: unknown } | null
      return typeof item?.msg === 'string' ? item.msg : null
    })
    const joined = parts.filter(Boolean).join('; ')
    if (joined) return joined
  }
  return null
}

/**
 * Build the error thrown for a non-2xx response: the API's `detail` as the
 * message (so a UI that renders `error.message` shows the real reason), with
 * the raw body kept in `details`.
 */
function httpError(status: number, statusText: string, body: string): Web10Error {
  const detail = extractDetail(body)
  const fallback = `Request failed: ${status} ${statusText}`.trim()
  return new Web10Error(detail ?? fallback, status, body || undefined)
}

/**
 * Perform a POST request.
 */
export async function authPost<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw httpError(res.status, res.statusText, text)
  }
  return res.json() as Promise<T>
}
