/**
 * HTTP transport layer using native fetch.
 */

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
    throw new Web10Error(
      `Request failed: ${res.status} ${res.statusText}`,
      res.status,
      text,
    )
  }
  return res.json() as Promise<T>
}
