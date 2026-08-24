/* script.js — feed demo (v3, D42 lazy discover group) */

const LOG = (...args) => console.log('[feed-demo]', ...args)
const LOG_ERR = (...args) => console.error('[feed-demo]', ...args)

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
const AUTH_ORIGIN = isLocal ? 'http://auth.localhost' : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const API_ORIGIN = isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app'
const SERVICE = 'web10-docs-feed-demo'

LOG('init — host:', host, 'isLocal:', isLocal, 'isDev:', isDev)
LOG('AUTH_ORIGIN:', AUTH_ORIGIN, 'API_ORIGIN:', API_ORIGIN, 'SERVICE:', SERVICE)

const w = window.web10.createV3Client({ apiOrigin: API_ORIGIN })

// DOM refs (explicit ids — a bare `body`/`message` would resolve to globals).
const authButton = document.getElementById('authButton')
const setupDiscoverBtn = document.getElementById('setupDiscoverBtn')
const fixAccessBtn = document.getElementById('fixAccessBtn')
const message = document.getElementById('message')
const editor = document.getElementById('editor')
const feed = document.getElementById('feed')
const feedMeta = document.getElementById('feedMeta')
const feedList = document.getElementById('feedList')
const postText = document.getElementById('postText')
const postBtn = document.getElementById('postBtn')
const creatorUsername = document.getElementById('creatorUsername')
const followBtn = document.getElementById('followBtn')

let ME = null // { username, provider } — set in initApp
let DISCOVER_GROUP = null // {provider}/groups/users/{me}/discover — set in ensureDiscoverGroup

// The discover group is the public board. Its id is derived by the API from the
// creator's token + the deterministic name "discover", so it is stable per user.
function discoverGroupId() {
  return `${ME.provider}/groups/users/${ME.username}/discover`
}

// A creator's followers group — "following" is just joining this open group.
function followersGroupId(creator) {
  return `${ME.provider}/groups/users/${creator}/followers`
}

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------

authButton.onclick = () => {
  LOG('authButton clicked — opening auth portal')
  window.web10.openAuthPortal(AUTH_ORIGIN)
  requestAppContract()
}

// The app contract is a one-time grant. Requested on the login click (cold
// start) — on a return run we don't re-request it, we just read; if it was
// revoked the read 403s and "Fix access" appears (D42 lazy pattern).
function requestAppContract() {
  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: { [SERVICE]: ['readAll', 'create', 'deleteOwn'] },
  }]
  LOG('sending app contract:', JSON.stringify(contract))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('app contract callback — status:', resp.status, resp.errors || '')
    if (resp.status === 'approved') {
      message.innerHTML += ` · <span style="color:var(--ok);">app contract approved</span>`
    } else if (resp.status === 'denied') {
      message.innerHTML += ` · <span style="color:var(--danger);">app contract denied</span>`
    } else {
      message.innerHTML += ` · <span style="color:var(--danger);">contract error: ${resp.errors?.[0] || 'unknown'}</span>`
    }
  })
}

window.web10.authListen(() => {
  LOG('authListen fired — user is signed in')
  initApp()
})

async function initApp() {
  LOG('initApp — setting up signed-in state')
  const t = w.readToken()
  if (!t) {
    LOG_ERR('initApp — readToken() is null, aborting')
    return
  }
  ME = { username: t.username, provider: t.provider }
  LOG('initApp — signed in as:', `${ME.provider}/${ME.username}`)
  authButton.innerHTML = 'Log out'
  authButton.onclick = () => {
    LOG('signOut clicked')
    w.signOut()
    window.location.reload()
  }
  message.innerHTML = `Signed in as <strong>${ME.provider}/${ME.username}</strong>`
  editor.style.display = 'block'
  feed.style.display = 'block'
  await ensureDiscoverGroup()
  loadFeed()
}

// ---------------------------------------------------------------------------
// Discover group — the public board. D42 lazy: set up through the real consent
// popup only when it's missing (first login). Idempotent on return runs.
// ---------------------------------------------------------------------------

async function ensureDiscoverGroup() {
  LOG('ensureDiscoverGroup — checking for an existing discover group')
  try {
    const myGroups = await w.getMyGroups()
    LOG('ensureDiscoverGroup — my groups:', JSON.stringify(myGroups.map((g) => g.group_id)))
    const existing = myGroups.find((g) => g.group_id === discoverGroupId())
    if (existing) {
      DISCOVER_GROUP = existing.group_id
      LOG('ensureDiscoverGroup — reusing existing discover group:', DISCOVER_GROUP)
    } else {
      DISCOVER_GROUP = null
      LOG('ensureDiscoverGroup — no discover group yet, showing setup button')
      setupDiscoverBtn.style.display = 'inline-block'
    }
  } catch (e) {
    LOG_ERR('ensureDiscoverGroup — getMyGroups FAILED:', e.name, e.message, 'status:', e.status, 'details:', e.details)
    if (isAppContractError(e)) showFixAccess('Access denied — your app contract may have been revoked.')
  }
}

setupDiscoverBtn.onclick = () => {
  LOG('setupDiscoverBtn clicked — opening auth portal to create the discover group')
  setupDiscoverBtn.style.display = 'none'
  window.web10.openAuthPortal(AUTH_ORIGIN, { handoff: 'none' })
  const contract = [{
    kind: 'group',
    app_origin: window.location.origin,
    action: 'create_group',
    name: 'discover',
    join_policy: 'open',
    roles: [
      { name: 'member', services: [SERVICE], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
    ],
    members: [{ member_key: ME.username, role: 'member' }],
  }]
  LOG('setupDiscover — sending group contract:', JSON.stringify(contract, null, 2))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('setupDiscover — contractRequest callback, status:', resp.status)
    if (resp.errors) LOG('setupDiscover — errors:', JSON.stringify(resp.errors))
    if (resp.status === 'approved') {
      DISCOVER_GROUP = discoverGroupId()
      LOG('setupDiscover — discover group created:', DISCOVER_GROUP)
      message.innerHTML = `<span style="color:var(--ok);">Discover group ready.</span>`
      loadFeed()
    } else {
      LOG_ERR('setupDiscover — contract request failed:', resp.status, resp.errors)
      setupDiscoverBtn.style.display = 'inline-block'
      message.innerHTML = `Failed to set up your discover group: ${resp.errors?.[0] || resp.status}`
    }
  })
}

// ---------------------------------------------------------------------------
// Follow a creator — joining their open followers group is the follow.
// ---------------------------------------------------------------------------

async function followCreator() {
  const creator = creatorUsername.value.trim()
  LOG('followCreator — called, creator:', creator)
  if (!creator) {
    LOG('followCreator — empty creator, aborting')
    return
  }
  const groupId = followersGroupId(creator)
  LOG('followCreator — joining followers group:', groupId)
  try {
    const res = await w.joinGroup(groupId)
    LOG('followCreator — joined, result:', JSON.stringify(res))
    creatorUsername.value = ''
    message.innerHTML = `<span style="color:var(--ok);">Following ${escapeHtml(creator)}.</span>`
    loadFeed()
  } catch (e) {
    LOG_ERR('followCreator FAILED:', e.name, e.message, 'status:', e.status, 'details:', e.details)
    if (e.status === 404) {
      message.innerHTML = `Creator "${escapeHtml(creator)}" has no followers group — they may not exist.`
    } else if (isAppContractError(e)) {
      showFixAccess('Cannot follow — your app contract may have been revoked.')
    } else {
      message.innerHTML = `Failed to follow: ${e.message}`
    }
  }
}

// ---------------------------------------------------------------------------
// Post to discover
// ---------------------------------------------------------------------------

async function postToDiscover() {
  const text = postText.value.trim()
  LOG('postToDiscover — called, text length:', text.length)
  if (!text) {
    LOG('postToDiscover — empty text, aborting')
    return
  }
  if (!DISCOVER_GROUP) {
    LOG_ERR('postToDiscover — DISCOVER_GROUP is null, set it up first')
    message.innerHTML = 'Set up your discover group first.'
    return
  }
  const body = { text, date: new Date().toISOString() }
  LOG('postToDiscover — body:', JSON.stringify(body), 'group:', DISCOVER_GROUP)
  try {
    const result = await w.create(SERVICE, body, { groups: [DISCOVER_GROUP] })
    LOG('postToDiscover — success, doc_id:', result.doc_id)
    postText.value = ''
    loadFeed()
  } catch (e) {
    LOG_ERR('postToDiscover FAILED:', e.name, e.message, 'status:', e.status, 'details:', e.details)
    if (isAppContractError(e)) {
      showFixAccess('Cannot post — your app contract may have been revoked.')
    } else {
      message.innerHTML = `Failed to post: ${e.message}`
    }
  }
}

// ---------------------------------------------------------------------------
// The feed — ONE multi-group read over discover + every followed followers group.
// ---------------------------------------------------------------------------

async function loadFeed() {
  LOG('loadFeed — called')
  // The followed creators' followers groups, derived from my membership (the
  // demo is stateless — no localStorage; membership IS the follow state).
  let followersGroups = []
  try {
    const myGroups = await w.getMyGroups()
    followersGroups = myGroups
      .filter((g) => g.group_id.endsWith('/followers') && !g.group_id.includes(`/${ME.username}/`))
      .map((g) => g.group_id)
    LOG('loadFeed — followers groups:', JSON.stringify(followersGroups))
  } catch (e) {
    LOG_ERR('loadFeed — getMyGroups FAILED:', e.name, e.message, 'status:', e.status, 'details:', e.details)
  }

  const groups = []
  if (DISCOVER_GROUP) groups.push(DISCOVER_GROUP)
  groups.push(...followersGroups)
  LOG('loadFeed — reading groups:', JSON.stringify(groups))

  if (!groups.length) {
    LOG('loadFeed — no groups to read yet')
    feedMeta.textContent = 'No groups yet.'
    feedList.innerHTML = '<p class="empty">No feed yet — set up your discover group above.</p>'
    return
  }

  try {
    const docs = await w.read(SERVICE, { groups })
    LOG('loadFeed — got', docs.length, 'docs')
    feedMeta.textContent = `Reading ${groups.length} group${groups.length === 1 ? '' : 's'}: ${groups.map(shortGroup).join(', ')}`
    displayFeed(docs)
  } catch (e) {
    LOG_ERR('loadFeed FAILED:', e.name, e.message, 'status:', e.status, 'details:', e.details)
    if (isAppContractError(e)) {
      showFixAccess('Access denied — your app contract may have been revoked.')
    } else {
      feedList.innerHTML = `<p class="empty">Failed to load feed: ${escapeHtml(e.message)}</p>`
    }
  }
}

// ---------------------------------------------------------------------------
// Delete own post (author-scoped)
// ---------------------------------------------------------------------------

async function deletePost(docId) {
  LOG('deletePost — called, docId:', docId)
  try {
    const result = await w.delete(docId)
    LOG('deletePost — success, result:', JSON.stringify(result))
    loadFeed()
  } catch (e) {
    LOG_ERR('deletePost FAILED:', e.name, e.message, 'status:', e.status)
    message.innerHTML = `Failed to delete: ${e.message}`
  }
}

// ---------------------------------------------------------------------------
// Fix access — re-request the app contract when it's been revoked
// ---------------------------------------------------------------------------

// The API returns a distinguishable 403 for a missing app contract
// ("No app contract for {origin} …"). The SDK's Web10Error puts the API's
// detail in `e.details` (e.message is the generic "Request failed: 403 …").
function errorText(e) {
  return `${e.message || ''} ${e.details || ''}`
}
function isAppContractError(e) {
  return e.status === 403 && /no app contract/i.test(errorText(e))
}

function showFixAccess(errorMsg) {
  LOG('showFixAccess — showing fix button, error:', errorMsg)
  fixAccessBtn.style.display = 'inline-block'
  message.innerHTML = `<span style="color:var(--danger);">${errorMsg}</span><br><span style="color:var(--muted);font-size:0.75rem;">Your app contract may have been revoked. Click "Fix access" to re-request.</span>`
}

fixAccessBtn.onclick = () => {
  LOG('fixAccessBtn clicked — re-requesting app contract')
  fixAccessBtn.style.display = 'none'
  window.web10.openAuthPortal(AUTH_ORIGIN, { handoff: 'none' })
  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: { [SERVICE]: ['readAll', 'create', 'deleteOwn'] },
  }]
  LOG('fixAccess — sending app contract:', JSON.stringify(contract))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('fixAccess — contractRequest callback, status:', resp.status)
    if (resp.status === 'approved') {
      LOG('fixAccess — contract re-approved, retrying loadFeed')
      message.innerHTML = `<span style="color:var(--ok);">Access restored.</span>`
      loadFeed()
    } else {
      LOG_ERR('fixAccess — failed:', resp.status, resp.errors)
      showFixAccess(`Fix access failed: ${resp.errors?.[0] || resp.status}`)
    }
  })
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function displayFeed(docs) {
  LOG('displayFeed — rendering', docs ? docs.length : 0, 'posts')
  if (!docs || docs.length === 0) {
    feedList.innerHTML = '<p class="empty">No posts yet — post to discover or follow a creator.</p>'
    return
  }
  feedList.innerHTML = docs
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((doc) => {
      const b = doc.body || {}
      const date = b.date ? new Date(b.date).toLocaleString() : (doc.created_at ? new Date(doc.created_at).toLocaleString() : '')
      const author = doc.author_key || '?'
      // Only the author can delete (the API scopes delete to the author), so
      // the button renders only on my own posts.
      const mine = doc.author_key === ME.username
      const delBtn = mine
        ? `<div class="post-actions"><button data-testid="delete-button" onclick="deletePost('${doc.doc_id}')">Delete</button></div>`
        : ''
      return `<div class="post" data-testid="feed-post">
        <div class="post-meta">
          <span class="post-author">@${escapeHtml(author)}</span>
          <span class="post-date">${escapeHtml(date)}</span>
        </div>
        <p class="post-text" data-testid="feed-post-text">${escapeHtml(b.text || JSON.stringify(b))}</p>
        ${delBtn}
      </div>`
    })
    .join('')
}

function shortGroup(g) {
  return g.split('/').slice(-2).join('/')
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '"')
}

// ---------------------------------------------------------------------------
// Self-register in the app store (no auth required)
// ---------------------------------------------------------------------------
fetch(`${API_ORIGIN}/v3/apps/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    body: {
      url: `${window.location.origin}${window.location.pathname}`,
      name: 'Feed',
      description: 'A social feed demo: post to the public discover board, follow creators, and read one combined multi-group feed.',
    },
  }),
}).catch(() => {})

// ---------------------------------------------------------------------------
// Wire up buttons + restore session on page load
// ---------------------------------------------------------------------------
postBtn.onclick = postToDiscover
followBtn.onclick = followCreator

if (w.isSignedIn()) {
  LOG('page load — already signed in')
  initApp()
} else {
  LOG('page load — not signed in, showing login button')
}