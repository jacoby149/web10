/* script.js — sharing demo */

const LOG = (...args) => console.log('[sharing-demo]', ...args)
const LOG_ERR = (...args) => console.error('[sharing-demo]', ...args)

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
// Port-aware: isolated e2e stacks (E2E_HTTP_PORT) serve *.localhost on a
// non-80 port; the origins must carry the same port. Empty on :80.
const portSuffix = window.location.port ? `:${window.location.port}` : ''
const AUTH_ORIGIN = isLocal ? `http://auth.localhost${portSuffix}` : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const API_ORIGIN = isLocal ? `http://api.localhost${portSuffix}` : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app'

LOG('init — host:', host, 'isLocal:', isLocal, 'isDev:', isDev)
LOG('AUTH_ORIGIN:', AUTH_ORIGIN)
LOG('API_ORIGIN:', API_ORIGIN)

const w = window.web10.createV3Client({ apiOrigin: API_ORIGIN })

const SERVICE = 'web10-docs-sharing-demo'
let SHARING_GROUP = null
let MY_USERNAME = null
// Set once initApp has run. The popup can hand back the token more than once
// (every "return to app" sends an `auth` message), and a page-load restore can
// race one — re-running initApp would re-append "sharing group ready".
// signOut() does a full reload, so the flag never outlives a session.
let appInitialized = false

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------

authButton.onclick = () => {
  LOG('authButton clicked — opening auth portal')
  window.web10.openAuthPortal(AUTH_ORIGIN)

  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      [SERVICE]: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
    },
  }]
  LOG('sending app contract:', JSON.stringify(contract, null, 2))

  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('contractRequest callback — status:', resp.status)
    if (resp.errors) LOG('contractRequest errors:', JSON.stringify(resp.errors))
    if (resp.status === 'approved') {
      LOG('app contract APPROVED')
      message.innerHTML += `<br><span style="color:var(--success);">app contract approved</span>`
    } else if (resp.status === 'denied') {
      LOG('app contract DENIED')
      message.innerHTML += `<br><span style="color:var(--danger);">app contract denied</span>`
    } else {
      LOG_ERR('contract request FAILED:', resp.errors?.[0] || 'unknown')
      message.innerHTML += `<br><span style="color:var(--danger);">contract request failed: ${resp.errors?.[0] || 'unknown'}</span>`
    }
  })
}

window.web10.authListen(() => {
  LOG('authListen fired — user is signed in')
  const t = w.readToken()
  LOG('token payload:', JSON.stringify(t, null, 2))
  if (!t) {
    LOG_ERR('authListen fired but readToken() returned null — cookie not set?')
    message.innerHTML += `<br><span style="color:var(--danger);">auth failed: no token in cookie</span>`
    return
  }
  initApp()
})

// ---------------------------------------------------------------------------
// App init
// ---------------------------------------------------------------------------

function initApp() {
  if (appInitialized) {
    LOG('initApp — already initialized, skipping redundant auth event')
    return
  }
  appInitialized = true
  LOG('initApp — setting up signed-in state')
  authButton.innerHTML = 'log out'
  authButton.onclick = () => {
    LOG('signOut clicked')
    w.signOut()
    window.location.reload()
  }
  const t = w.readToken()
  MY_USERNAME = t.username
  LOG('initApp — token:', t ? `${t.provider}/${t.username}` : 'null')
  message.innerHTML = `hello ${t.provider}/${t.username},<br>`
  app.style.display = 'block'
  findSharingGroup()
}

// The demo's group is deterministic: sharing-{username}. On the return run it
// already exists (the API's create_group is idempotent, so re-sending the
// contract is safe); on the cold start it doesn't, so a "Set up your sharing
// group" button appears (user gesture → consent popup, the D42 pattern).
async function findSharingGroup() {
  LOG('findSharingGroup — looking up my groups')
  try {
    const groups = await w.getMyGroups()
    LOG('findSharingGroup — my groups:', JSON.stringify(groups.map((g) => g.group_id)))
    const groupName = `sharing-${MY_USERNAME}`
    const found = groups.find((g) => g.group_id.endsWith(`/${groupName}`))
    if (found) {
      SHARING_GROUP = found.group_id
      LOG('findSharingGroup — found existing group:', SHARING_GROUP)
      groupReady()
    } else {
      LOG('findSharingGroup — no sharing group yet, showing setup button')
      setupGroupBtn.style.display = 'inline-block'
      message.innerHTML += `<br><span style="color:var(--muted);font-size:0.75rem;">Set up your sharing group to start.</span>`
    }
  } catch (e) {
    LOG_ERR('findSharingGroup FAILED:', e.name, e.message, 'status:', e.status)
    if (isAppContractError(e)) {
      showFixAccess('Access denied — your app contract may have been revoked.')
    } else {
      message.innerHTML = `failed to load groups: ${e.message}`
    }
  }
}

function groupReady() {
  LOG('groupReady — group:', SHARING_GROUP)
  setupGroupBtn.style.display = 'none'
  message.innerHTML += `<br><span style="color:var(--success);">sharing group ready</span>`
  loadPosts()
}

setupGroupBtn.onclick = () => {
  LOG('setupGroupBtn clicked — opening auth portal to create the sharing group')
  setupGroupBtn.style.display = 'none'
  const t = w.readToken()
  if (!t) {
    LOG_ERR('setupGroupBtn — no token, cannot create group')
    return
  }
  const groupName = `sharing-${MY_USERNAME}`
  const contract = [{
    kind: 'group',
    app_origin: window.location.origin,
    action: 'create_group',
    name: groupName,
    join_policy: 'invite_only',
    roles: [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
      { name: 'member', services: [SERVICE], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
    ],
    members: [{ member_key: t.username, role: 'owner' }],
  }]
  LOG('setupGroup — sending group contract:', JSON.stringify(contract, null, 2))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('setupGroup — contractRequest callback, status:', resp.status)
    if (resp.errors) LOG('setupGroup — errors:', JSON.stringify(resp.errors))
    if (resp.status === 'approved') {
      SHARING_GROUP = `${t.provider}/groups/users/${t.username}/${groupName}`
      LOG('setupGroup — group created:', SHARING_GROUP)
      groupReady()
    } else {
      LOG_ERR('setupGroup — contract request failed:', resp.status, resp.errors)
      setupGroupBtn.style.display = 'inline-block'
      message.innerHTML += `<br><span style="color:var(--danger);">Failed to set up your sharing group: ${resp.errors?.[0] || resp.status}</span>`
    }
  })
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

async function loadPosts() {
  LOG('loadPosts — called')
  if (!SHARING_GROUP) {
    LOG('loadPosts — SHARING_GROUP is null, waiting for group setup')
    return
  }
  LOG('loadPosts — querying service:', SERVICE, 'group:', SHARING_GROUP)
  try {
    const docs = await w.read(SERVICE, { groups: [SHARING_GROUP] })
    LOG('loadPosts — got', docs.length, 'docs')
    displayPosts(docs)
  } catch (e) {
    LOG_ERR('loadPosts FAILED:', e.name, e.message, 'status:', e.status)
    if (isAppContractError(e)) {
      showFixAccess('Access denied — your app contract may have been revoked.')
    } else if (isGroupError(e)) {
      showSetupGroup('Your sharing group is missing — set it up to see your posts.')
    } else {
      posts.innerHTML = `<p class="empty">failed to load posts: ${escapeHtml(e.message)}</p>`
    }
  }
}

postBtn.onclick = () => postToGroup()

async function postToGroup() {
  const text = postText.value.trim()
  LOG('postToGroup — called, text length:', text.length)
  if (!text) {
    LOG('postToGroup — empty text, aborting')
    return
  }
  if (!SHARING_GROUP) {
    LOG_ERR('postToGroup — SHARING_GROUP is null')
    return
  }
  const body = { text, date: new Date().toISOString() }
  LOG('postToGroup — body:', JSON.stringify(body))
  LOG('postToGroup — groups:', JSON.stringify([SHARING_GROUP]))
  try {
    const result = await w.create(SERVICE, body, { groups: [SHARING_GROUP] })
    LOG('postToGroup — success, doc_id:', result.doc_id)
    postText.value = ''
    loadPosts()
  } catch (e) {
    LOG_ERR('postToGroup FAILED:', e.name, e.message, 'status:', e.status)
    if (isAppContractError(e)) {
      showFixAccess('Cannot post — your app contract may have been revoked.')
    } else if (isGroupError(e)) {
      showSetupGroup('Cannot post — your sharing group is missing.')
    } else {
      message.innerHTML += `<br><span style="color:var(--danger);">failed to post: ${escapeHtml(e.message)}</span>`
    }
  }
}

// ---------------------------------------------------------------------------
// Sharing toggle (per user, per group)
// ---------------------------------------------------------------------------

pauseSharingBtn.onclick = () => setSharing(false)
resumeSharingBtn.onclick = () => setSharing(true)

async function setSharing(enabled) {
  LOG('setSharing — called, enabled:', enabled)
  if (!SHARING_GROUP) {
    LOG_ERR('setSharing — SHARING_GROUP is null')
    return
  }
  LOG('setSharing — group:', SHARING_GROUP)
  try {
    const res = await w.setSharing(SHARING_GROUP, enabled)
    LOG('setSharing — success:', JSON.stringify(res))
    sharingStatus.innerHTML = enabled
      ? '<span style="color:var(--success);">Sharing is on — members can see your posts.</span>'
      : '<span style="color:var(--warning);">Sharing is paused — members can\'t see your posts. You can still see them.</span>'
    loadPosts()
  } catch (e) {
    LOG_ERR('setSharing FAILED:', e.name, e.message, 'status:', e.status)
    sharingStatus.innerHTML = `<span style="color:var(--danger);">failed to ${enabled ? 'resume' : 'pause'} sharing: ${escapeHtml(e.message)}</span>`
  }
}

// ---------------------------------------------------------------------------
// Blacklists (user-wide + per-group)
// ---------------------------------------------------------------------------

blockUserBtn.onclick = () => setUserBlock(false)
unblockUserBtn.onclick = () => setUserBlock(true)

async function setUserBlock(unblock) {
  const key = blockUserInput.value.trim()
  LOG('setUserBlock — called, unblock:', unblock, 'key:', key)
  if (!key) {
    LOG('setUserBlock — empty username, aborting')
    blockStatus.innerHTML = '<span style="color:var(--muted);">Enter a username first.</span>'
    return
  }
  try {
    const res = unblock ? await w.unblockUser(key) : await w.blockUser(key)
    LOG('setUserBlock — success:', JSON.stringify(res))
    blockStatus.innerHTML = unblock
      ? `<span style="color:var(--success);">Unblocked ${escapeHtml(key)} — they can see your content again.</span>`
      : `<span style="color:var(--danger);">Blocked ${escapeHtml(key)} everywhere — they can't see any of your content.</span>`
  } catch (e) {
    LOG_ERR('setUserBlock FAILED:', e.name, e.message, 'status:', e.status)
    blockStatus.innerHTML = `<span style="color:var(--danger);">failed: ${escapeHtml(e.message)}</span>`
  }
}

blockGroupBtn.onclick = () => setGroupBlock(false)
unblockGroupBtn.onclick = () => setGroupBlock(true)

async function setGroupBlock(unblock) {
  const key = blockGroupInput.value.trim()
  LOG('setGroupBlock — called, unblock:', unblock, 'key:', key)
  if (!key) {
    LOG('setGroupBlock — empty username, aborting')
    blockStatus.innerHTML = '<span style="color:var(--muted);">Enter a username first.</span>'
    return
  }
  if (!SHARING_GROUP) {
    LOG_ERR('setGroupBlock — SHARING_GROUP is null')
    return
  }
  try {
    const res = unblock ? await w.unblockUserInGroup(key, SHARING_GROUP) : await w.blockUserInGroup(key, SHARING_GROUP)
    LOG('setGroupBlock — success:', JSON.stringify(res))
    blockStatus.innerHTML = unblock
      ? `<span style="color:var(--success);">Unblocked ${escapeHtml(key)} in this group — they can see your posts here again.</span>`
      : `<span style="color:var(--danger);">Blocked ${escapeHtml(key)} in this group — they still see everyone else's posts here, just not yours.</span>`
  } catch (e) {
    LOG_ERR('setGroupBlock FAILED:', e.name, e.message, 'status:', e.status)
    blockStatus.innerHTML = `<span style="color:var(--danger);">failed: ${escapeHtml(e.message)}</span>`
  }
}

// ---------------------------------------------------------------------------
// Fix access — re-request contract when it's been revoked
// ---------------------------------------------------------------------------

// D42: the API returns distinguishable 403s so the demo shows the right button.
// App contract missing → "No app contract for {origin} …" → Fix access.
// Group missing / not a member → "not a member of the requested group" → Set up group.
function errorText(e) {
  return `${e.message || ''} ${e.details || ''}`
}
function isAppContractError(e) {
  return e.status === 403 && /no app contract/i.test(errorText(e))
}
function isGroupError(e) {
  return e.status === 403 && /not a member/i.test(errorText(e))
}

function showFixAccess(errorMsg) {
  LOG('showFixAccess — showing fix button, error:', errorMsg)
  fixAccessBtn.style.display = 'inline-block'
  message.innerHTML += `<br><span style="color:var(--danger);">${escapeHtml(errorMsg)}</span>`
}

function showSetupGroup(errorMsg) {
  LOG('showSetupGroup — showing setup button, error:', errorMsg)
  setupGroupBtn.style.display = 'inline-block'
  message.innerHTML += `<br><span style="color:var(--danger);">${escapeHtml(errorMsg)}</span>`
}

fixAccessBtn.onclick = () => {
  LOG('fixAccessBtn clicked — opening auth portal to re-request contract')
  fixAccessBtn.style.display = 'none'
  window.web10.openAuthPortal(AUTH_ORIGIN)
  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      [SERVICE]: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
    },
  }]
  LOG('fixAccess — sending app contract:', JSON.stringify(contract, null, 2))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('fixAccess — contractRequest callback, status:', resp.status)
    if (resp.status === 'approved') {
      LOG('fixAccess — contract re-approved, retrying loadPosts')
      message.innerHTML += `<br><span style="color:var(--success);">Access restored.</span>`
      loadPosts()
    } else {
      LOG_ERR('fixAccess — contract request failed:', resp.status, resp.errors)
      showFixAccess(`Fix access failed: ${resp.errors?.[0] || resp.status}`)
    }
  })
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function displayPosts(docs) {
  LOG('displayPosts — rendering', docs.length, 'posts')
  if (!docs.length) {
    posts.innerHTML = '<p class="empty">no posts yet — write one above</p>'
    return
  }
  posts.innerHTML = docs
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((doc) => {
      const own = doc.author_key === MY_USERNAME
      const escaped = escapeHtml(doc.body.text || JSON.stringify(doc.body))
      return `<div class="post">
        <div class="post-meta">
          <span class="post-author">@${escapeHtml(doc.author_key)}${own ? ' <span class="own-badge">you</span>' : ''}</span>
          <span class="post-date">${new Date(doc.created_at).toLocaleString()}</span>
        </div>
        <div class="post-text">${escaped}</div>
      </div>`
    })
    .join('')
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
