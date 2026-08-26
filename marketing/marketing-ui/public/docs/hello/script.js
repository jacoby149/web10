/* script.js — hello demo */

const LOG = (...args) => console.log('[hello-demo]', ...args)
const LOG_ERR = (...args) => console.error('[hello-demo]', ...args)

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
// non-80 port; the origins must carry the same port. Empty on :80.
const portSuffix = window.location.port ? `:${window.location.port}` : ''
const AUTH_ORIGIN = isLocal ? `http://auth.localhost${portSuffix}` : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const API_ORIGIN = isLocal ? `http://api.localhost${portSuffix}` : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app'

LOG('init — host:', host, 'isLocal:', isLocal, 'isDev:', isDev)
LOG('AUTH_ORIGIN:', AUTH_ORIGIN)
LOG('API_ORIGIN:', API_ORIGIN)

const w = window.web10.createV3Client({ apiOrigin: API_ORIGIN })

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------

authButton.onclick = () => {
  LOG('authButton clicked — opening auth portal')
  LOG('opening popup at:', AUTH_ORIGIN)
  window.web10.openAuthPortal(AUTH_ORIGIN)

  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      'profile': ['readAll'],
    },
  }]
  LOG('sending app contract:', JSON.stringify(contract, null, 2))

  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('contractRequest callback — status:', resp.status)
    if (resp.errors) LOG('contractRequest errors:', JSON.stringify(resp.errors))
    if (resp.status === 'approved') {
      LOG('app contract APPROVED')
      message.innerHTML += `<br><span style="color:#22c55e;">app contract approved</span>`
    } else if (resp.status === 'denied') {
      LOG('app contract DENIED')
      message.innerHTML += `<br><span style="color:#ef4444;">app contract denied</span>`
    } else {
      LOG_ERR('contract request FAILED:', resp.errors?.[0] || 'unknown')
      message.innerHTML += `<br><span style="color:#ef4444;">contract request failed: ${resp.errors?.[0] || 'unknown'}</span>`
    }
  })
}

window.web10.authListen(() => {
  LOG('authListen fired — user is signed in')
  const t = w.readToken()
  LOG('token payload:', t ? JSON.stringify(t, null, 2) : 'null')
  if (!t) {
    LOG_ERR('authListen fired but readToken() returned null — cookie not set?')
    message.innerHTML += `<br><span style="color:#ef4444;">auth failed: no token in cookie</span>`
    return
  }
  LOG('proceeding to initApp')
  initApp()
})

// ---------------------------------------------------------------------------
// App init
// ---------------------------------------------------------------------------

function initApp() {
  LOG('initApp — setting up signed-in state')
  authButton.innerHTML = 'log out'
  authButton.onclick = () => {
    LOG('signOut clicked')
    w.signOut()
    window.location.reload()
  }
  const t = w.readToken()
  LOG('initApp — token:', t ? `${t.provider}/${t.username}` : 'null')
  message.innerHTML = `hello ${t.provider}/${t.username},<br>`
  loadGroups()
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

async function loadGroups() {
  LOG('loadGroups — fetching user groups')
  try {
    const groups = await w.getMyGroups()
    LOG('loadGroups — got', groups.length, 'groups')
    if (!groups.length) {
      LOG('loadGroups — no groups, showing hint')
      message.innerHTML += '<br><span style="color:var(--muted);">no groups yet — try the groups demo to create one</span>'
      return
    }
    const list = groups.map(g => {
      const short = g.group_id.split('/').slice(-2).join('/')
      return `<span class="group-chip">${short}</span>`
    }).join('')
    message.innerHTML += `<br><span style="color:#a1a1aa;font-size:0.75rem;">your groups:</span><br><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${list}</div>`
  } catch (e) {
    LOG_ERR('loadGroups FAILED:', e.name, e.message, 'status:', e.status)
    message.innerHTML += `<br><span style="color:#ef4444;">failed to load groups: ${e.message}</span>`
  }
}

// ---------------------------------------------------------------------------
// Restore session on page load
// ---------------------------------------------------------------------------

if (w.isSignedIn()) {
  LOG('page load — already signed in')
  const t = w.readToken()
  LOG('restored token:', t ? `${t.provider}/${t.username}` : 'null')
  if (t) {
    initApp()
  } else {
    LOG_ERR('isSignedIn() true but readToken() is null — stale cookie?')
    w.signOut()
  }
} else {
  LOG('page load — not signed in, showing login button')
}
