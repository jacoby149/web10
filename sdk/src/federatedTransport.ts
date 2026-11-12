/** Explicit destination dispatch, not approval or server authorization.
 * The owner must obtain consent before constructing an authenticated transport,
 * abort its signal on account/token/destination changes, and discard the instance.
 * No cookies, registration, token refresh, redirects or ambient-client fallback.
 */
export function nodeOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/'
    || url.search || url.hash || url.hostname.endsWith('.') || !url.hostname.includes('.')) {
    throw new Error('Expected an exact HTTPS node origin')
  }
  return url.origin
}

type Options = {
  approvedOrigin: string
  credential: string | null
  signal: AbortSignal
  isCurrent: () => boolean
  fetcher?: typeof fetch
}
const AUTH_ACTIONS = new Set([
  'query', 'read', 'contentViews', 'groups/list', 'groups/get', 'groups/join',
  'groups/leave', 'groups/accept-invite', 'groups/decline-invite',
  'app-contracts/list', 'app-contracts/add', 'app-contracts/revoke', 'users/directory', 'groups/directory',
])
const PUBLIC_ACTIONS = new Set(['query', 'read', 'users/directory', 'groups/directory'])
const MAX_BYTES = 1024 * 1024
const MAX_REQUEST_BYTES = 256 * 1024
const MAX_ACTIVE = 4
const MAX_QUEUED = 64
const OVERSIZED_RESPONSE = Symbol('oversized node response')
class DispatchError extends Error {}

export function createFederatedTransport(options: Options) {
  const origin = nodeOrigin(options.approvedOrigin)
  const credential = options.credential
  if (credential !== null && (typeof credential !== 'string' || !credential.trim())) {
    throw new Error('Expected an explicit credential or public mode')
  }
  const fetcher = options.fetcher ?? fetch
  const owner = new AbortController()
  const active = new Set<AbortController>()
  const queue: { run: () => void; reject: (reason: Error) => void }[] = []
  const cancelled = () => new Error('Federated request scope ended')
  const current = () => {
    if (owner.signal.aborted || options.signal.aborted || !options.isCurrent()) throw cancelled()
  }
  function dispose() {
    owner.abort()
    options.signal.removeEventListener('abort', dispose)
    for (const controller of active) controller.abort()
    for (const pending of queue.splice(0)) pending.reject(cancelled())
  }
  options.signal.addEventListener('abort', dispose, { once: true })
  if (options.signal.aborted) dispose()

  function drain() {
    while (active.size < MAX_ACTIVE && queue.length) queue.shift()!.run()
  }

  async function read(response: Response, controller: AbortController): Promise<unknown> {
    if (Number(response.headers.get('Content-Length')) > MAX_BYTES || !response.body) {
      controller.abort()
      throw new Error('Invalid or oversized node response')
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let bytes = 0
    let text = ''
    try {
      while (true) {
        const part = await reader.read()
        current()
        if (controller.signal.aborted) throw cancelled()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > MAX_BYTES) {
          controller.abort()
          throw OVERSIZED_RESPONSE
        }
        text += decoder.decode(part.value, { stream: true })
      }
      return JSON.parse(text + decoder.decode()) as unknown
    } finally {
      try { await reader.cancel() } finally { reader.releaseLock() }
    }
  }

  function post(action: string, body: Record<string, unknown>): Promise<unknown> {
    try {
      current()
      const allowed = credential === null ? PUBLIC_ACTIONS : AUTH_ACTIONS
      if (!allowed.has(action) || Object.hasOwn(body, 'token') || Object.hasOwn(body, 'toJSON')) {
        throw new DispatchError('Unsupported federated request')
      }
      // Null prototype prevents inherited root hooks; transport fields are final.
      const envelope = Object.assign(Object.create(null) as Record<string, unknown>, body)
      if (Object.hasOwn(envelope, 'toJSON')) throw new DispatchError('Unsupported federated request')
      delete envelope.token
      if (credential !== null) envelope.token = credential
      // The existing group directory is a public GET. Only paging scalars may
      // enter its query string, never the credential from the POST envelope.
      const directory = action === 'groups/directory'
      if (directory && (!Number.isInteger(body.limit) || Number(body.limit) < 1 || Number(body.limit) > 100
        || !Number.isSafeInteger(body.offset) || Number(body.offset) < 0 || !['popular', 'newest'].includes(String(body.sort))
        || Object.keys(body).some(key => !['limit', 'offset', 'sort'].includes(key)))) throw new DispatchError('Invalid directory request')
      const query = directory ? `?limit=${body.limit}&offset=${body.offset}&sort=${body.sort}` : ''
      const payload = JSON.stringify(envelope)
      if (new TextEncoder().encode(payload).byteLength > MAX_REQUEST_BYTES) throw new DispatchError('Oversized node request')
      if (active.size >= MAX_ACTIVE && queue.length >= MAX_QUEUED) throw new DispatchError('Federated request queue full')
      return new Promise((resolve, reject) => {
        const run = () => {
          const controller = new AbortController()
          try { current() } catch { reject(cancelled()); return }
          active.add(controller)
          const timer = setTimeout(() => controller.abort(), 10000)
          console.info('[federation] request started', { action, active: active.size })
          void (async () => {
            let response: Response | undefined
            try {
              response = await fetcher(`${origin}/v3/${action}${query}`, {
                method: directory ? 'GET' : 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
                referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }, body: directory ? undefined : payload,
              })
              current()
              if (controller.signal.aborted) throw cancelled()
              console.info('[federation] response received', { action, status: response.status })
              if (!response.ok || response.redirected || (response.url && new URL(response.url).origin !== origin)) {
                controller.abort()
                try { await response.body?.cancel() } catch { /* Abort may have closed the stream. */ }
                throw new Error('Node request denied or unavailable')
              }
              const result = await read(response, controller)
              current()
              if (controller.signal.aborted) throw cancelled()
              resolve(result)
            } catch (error) {
              controller.abort()
              try { await response?.body?.cancel() } catch { /* Read/abort may already have closed it. */ }
              // Do not echo a server/fetch exception that could contain private URLs.
              console.info('[federation] request failed', { action })
              reject(new Error(error === OVERSIZED_RESPONSE
                ? 'Oversized node response' : 'Node request failed or scope ended'))
            } finally {
              clearTimeout(timer)
              active.delete(controller)
              console.info('[federation] request settled', { action, active: active.size })
              drain()
            }
          })()
        }
        if (active.size < MAX_ACTIVE) run()
        else queue.push({ run, reject })
      })
    } catch (error) {
      return Promise.reject(new Error(error instanceof DispatchError ? error.message : 'Federated request rejected'))
    }
  }
  return { origin, post, dispose }
}
