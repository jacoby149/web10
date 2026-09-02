/* messages demo — script.js (v3 with groups, D42 lazy DM) */

const LOG = (...args) => console.log('[messages-demo]', ...args)
const LOG_ERR = (...args) => console.error('[messages-demo]', ...args)

const ERROR_MSGS = {
  read: 'Failed to read messages',
  send: 'Failed to send message',
  delete: 'Failed to delete message',
}

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
// non-80 port; the origins must carry the same port. Empty on :80.
const portSuffix = window.location.port ? `:${window.location.port}` : ''
const AUTH_ORIGIN = isLocal ? `http://auth.localhost${portSuffix}` : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const API_ORIGIN = isLocal ? `http://api.localhost${portSuffix}` : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app'
const RTC_SERVER = isLocal ? 'rtc.localhost' : isDev ? 'rtc.dev.web10.app' : 'rtc.web10.app'
const SERVICE = 'web10-docs-message-demo'
// P2P: the peer ID is `${provider} ${username} ${site} ${label}` (dots→underscores).
// `site` is the token's `site` claim (node default "web10"); `label` scopes the
// connection to this demo. Both parties must use the same label + site to match.
const P2P_LABEL = 'messages-demo'
let P2P_SITE = 'web10' // updated from the signed-in token in initApp

LOG('init — host:', host, 'isLocal:', isLocal, 'isDev:', isDev)
LOG('AUTH_ORIGIN:', AUTH_ORIGIN, 'API_ORIGIN:', API_ORIGIN, 'RTC_SERVER:', RTC_SERVER)

const w = window.web10.createV3Client({ apiOrigin: API_ORIGIN, rtcServer: RTC_SERVER })

// The textarea is id="msgText" (NOT "body" — a bare `body` resolves to
// document.body, not the input).
const msgText = document.getElementById('msgText')

let ME = null // { username, provider } — set in initApp

// ---------------------------------------------------------------------------
// WebRTC P2P — real-time delivery over a data channel (the group + CRUD is
// the source of truth; P2P is the fast path that refreshes the recipient).
// ---------------------------------------------------------------------------

let rtc = null        // the RTC connector (createRTC(w))
let p2pReady = false  // true once the local peer is open (signaling connected)

if (window.web10rtc && window.Peer) {
  window.web10rtc.setPeer(window.Peer)
  rtc = window.web10rtc.createRTC(w)
  LOG('RTC module + PeerJS loaded — P2P available, awaiting sign-in to init')
  p2pStatus.textContent = 'P2P: standby'
} else {
  LOG_ERR('RTC module (web10rtc) or PeerJS (Peer) missing — P2P disabled, CRUD-only delivery')
  p2pStatus.textContent = 'P2P: unavailable'
}

/**
 * Initialize the P2P peer once signed in. Resolves when the local peer is
 * open (its signaling connection is established) — only then can we connect
 * to a remote peer without losing the first message.
 */
async function initP2P() {
  if (!rtc) {
    LOG('initP2P — rtc is null, skipping')
    return
  }
  LOG('initP2P — initializing, secure:', !isLocal, 'rtcServer:', RTC_SERVER, 'label:', P2P_LABEL)
  try {
    await rtc.initP2P(onInbound, P2P_LABEL, !isLocal)
    p2pReady = true
    const localId = rtc.peerId(ME.provider, ME.username, P2P_SITE, P2P_LABEL)
    LOG('initP2P — P2P READY, local peerId:', localId)
    p2pStatus.textContent = 'P2P: ready'
    p2pStatus.style.color = '#22c55e'
  } catch (e) {
    LOG_ERR('initP2P FAILED:', e.name, e.message)
    p2pStatus.textContent = 'P2P: error'
    p2pStatus.style.color = '#ef4444'
  }
}

/**
 * Inbound P2P data from a peer. The payload mirrors the CRUD message body.
 * We re-read the inbox from the group (CRUD = source of truth) so the display
 * stays consistent with the persisted messages and never duplicates.
 */
function onInbound(conn, data) {
  LOG('onInbound — P2P message from peer:', conn.peer)
  LOG('onInbound — data:', JSON.stringify(data))
  readMessages()
}

/**
 * Fire-and-forget P2P delivery of a just-persisted message to the recipient.
 * Skipped (CRUD-only) if P2P isn't ready — the message still lands via the
 * group, the recipient just won't get the real-time nudge.
 */
function sendP2P(toProv, toUser, payload) {
  if (!rtc || !p2pReady) {
    LOG('sendP2P — P2P not ready, skipping (CRUD-only delivery)')
    return
  }
  LOG('sendP2P — sending over P2P to', `${toProv}/${toUser}`, 'site:', P2P_SITE, 'label:', P2P_LABEL)
  try {
    const result = rtc.send(toProv, toUser, P2P_SITE, P2P_LABEL, payload)
    LOG('sendP2P — result:', JSON.stringify(result))
  } catch (e) {
    LOG_ERR('sendP2P FAILED:', e.name, e.message)
  }
}

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------

authButton.onclick = () => {
  LOG('authButton clicked — opening auth portal')
  window.web10.openAuthPortal(AUTH_ORIGIN)
  requestAppContract()
}

window.web10.authListen(() => {
  LOG('authListen fired — user is signed in')
  initApp()
})

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
      message.innerHTML += ` · <span style="color:#22c55e;">app contract approved</span>`
    } else if (resp.status === 'denied') {
      message.innerHTML += ` · <span style="color:#ef4444;">app contract denied</span>`
    } else {
      message.innerHTML += ` · <span style="color:#ef4444;">contract error: ${resp.errors?.[0] || 'unknown'}</span>`
    }
  })
}

function initApp() {
  LOG('initApp — setting up signed-in state')
  const t = w.readToken()
  if (!t) {
    LOG_ERR('initApp — readToken() is null, aborting')
    return
  }
  ME = { username: t.username, provider: t.provider }
  P2P_SITE = t.site || 'web10'
  LOG('initApp — signed in as:', `${ME.provider}/${ME.username}`, 'site:', P2P_SITE)
  authButton.innerHTML = 'Log out'
  authButton.onclick = () => {
    LOG('signOut clicked')
    w.signOut()
    window.location.reload()
  }
  message.innerHTML = `Signed in as <strong>${ME.provider}/${ME.username}</strong>`
  editor.style.display = 'block'
  // Default recipient: yourself, so the demo round-trips with one login.
  toUsername.value = ME.username
  toProvider.value = ME.provider

  // Initialize P2P (resolves when the local peer is open). Runs alongside the
  // inbox read — by the time a message is sent, the peer is ready.
  initP2P()

  // Load the inbox (the read is the test — a 403 means the contract was
  // revoked, which surfaces "Fix access").
  readMessages()
}

// ---------------------------------------------------------------------------
// DM group — deterministic name, reuse existing, create only on first need
// ---------------------------------------------------------------------------

// The DM group name is symmetric (sorted), so alice→bob and bob→alice resolve
// to the same name. The API derives the group_id from the CREATOR's token, so
// the owner is whoever set the group up first — but the name is stable, which
// is what lets the second party find and reuse the group instead of creating
// a duplicate.
function dmGroupName(a, b) {
  const sorted = [a, b].sort()
  return `dm-${sorted[0]}-${sorted[1]}`
}

/**
 * Find an existing DM group with `them` among my groups (by deterministic
 * name). Returns the group_id, or null if I'm not in one yet.
 */
async function findDmGroup(them) {
  const name = dmGroupName(ME.username, them)
  LOG('findDmGroup — looking for name:', name)
  const myGroups = await w.getMyGroups()
  LOG('findDmGroup — my groups:', JSON.stringify(myGroups.map((g) => g.group_id)))
  const match = myGroups.find((g) => g.group_id.endsWith(`/${name}`))
  if (match) {
    LOG('findDmGroup — reusing existing group:', match.group_id)
    return match.group_id
  }
  LOG('findDmGroup — no existing DM group with', them)
  return null
}

/**
 * Create the DM group via the consent popup (I become the owner). Called only
 * when no existing DM group is found — i.e. the first message to this user.
 * handoff=none: the app already holds the token, so this popup is consent-only.
 */
function createDmGroup(them, callback) {
  const name = dmGroupName(ME.username, them)
  const contract = [{
    kind: 'group',
    app_origin: window.location.origin,
    action: 'create_group',
    name,
    join_policy: 'invite_only',
    roles: [
      { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'group': ['manageRoles'] } },
      { name: 'member', permissions: { [SERVICE]: ['readAll', 'create', 'deleteOwn'] } },
    ],
    members: [
      { member_key: ME.username, role: 'owner' },
      { member_key: them, role: 'member' },
    ],
  }]
  LOG('createDmGroup — opening consent popup + sending group contract:', JSON.stringify(contract))
  window.web10.openAuthPortal(AUTH_ORIGIN, { handoff: 'none' })
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('createDmGroup — callback, status:', resp.status, resp.errors || '')
    if (resp.status === 'approved') {
      // The API derives group_id from the creator (me) + the deterministic name.
      const groupId = `${ME.provider}/groups/users/${ME.username}/${name}`
      LOG('createDmGroup — approved, group_id:', groupId)
      callback(groupId)
    } else {
      LOG_ERR('createDmGroup — failed:', resp.status, resp.errors)
      message.innerHTML = `Failed to set up your DM with <strong>${escapeHtml(them)}</strong>: ${resp.errors?.[0] || resp.status}`
    }
  })
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

async function readMessages() {
  LOG('readMessages — called')
  try {
    // groups: ['me'] = every group I'm a member of, scoped to this service —
    // i.e. my DM inbox across all conversations.
    const docs = await w.read(SERVICE, { groups: ['me'] })
    LOG('readMessages — got', docs.length, 'docs')
    displayMessages(docs)
  } catch (e) {
    LOG_ERR('readMessages FAILED:', e.name, e.message, 'status:', e.status, 'details:', e.details)
    if (isAppContractError(e)) {
      showFixAccess('Access denied — your app contract may have been revoked.')
    } else {
      message.innerHTML = ERROR_MSGS.read
    }
  }
}

async function sendMessage() {
  const toUser = toUsername.value.trim()
  const toProv = toProvider.value.trim()
  const text = msgText.value.trim()
  LOG('sendMessage — called, to:', `${toProv}/${toUser}`, 'text length:', text.length)
  if (!toUser || !text) {
    LOG('sendMessage — missing recipient or text, aborting')
    return
  }

  const payload = {
    from_username: ME.username,
    from_provider: ME.provider,
    to_username: toUser,
    to_provider: toProv,
    text,
    date: new Date().toISOString(),
  }

  try {
    // Reuse an existing DM group (no popup). Only the first message to a new
    // user opens the consent popup to create the group.
    const existing = await findDmGroup(toUser)
    if (existing) {
      LOG('sendMessage — creating message in existing group:', existing)
      await w.create(SERVICE, payload, { groups: [existing] })
      sendP2P(toProv, toUser, payload)
      onSent(toUser, toProv)
      return
    }

    // No existing group — create it (popup), then send.
    createDmGroup(toUser, async (groupId) => {
      try {
        LOG('sendMessage — creating message in new group:', groupId)
        await w.create(SERVICE, payload, { groups: [groupId] })
        sendP2P(toProv, toUser, payload)
        onSent(toUser, toProv)
      } catch (err) {
        LOG_ERR('sendMessage — create FAILED:', err.name, err.message, 'status:', err.status)
        message.innerHTML = ERROR_MSGS.send
      }
    })
  } catch (e) {
    LOG_ERR('sendMessage FAILED:', e.name, e.message, 'status:', e.status, 'details:', e.details)
    if (isAppContractError(e)) {
      showFixAccess('Cannot send — your app contract may have been revoked.')
    } else {
      message.innerHTML = ERROR_MSGS.send
    }
  }
}

function onSent(toUser, toProv) {
  msgText.value = ''
  message.innerHTML = `Sent to <strong>${escapeHtml(toUser)}/${escapeHtml(toProv)}</strong>`
  LOG('sendMessage — sent to', `${toProv}/${toUser}`)
  // Refresh the inbox (if I sent to myself, the message is now in my inbox).
  readMessages()
}

async function deleteMessage(docId) {
  LOG('deleteMessage — called, docId:', docId)
  try {
    await w.delete(docId)
    LOG('deleteMessage — success')
    readMessages()
  } catch (e) {
    LOG_ERR('deleteMessage FAILED:', e.name, e.message, 'status:', e.status)
    message.innerHTML = ERROR_MSGS.delete
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
  message.innerHTML = `<span style="color:#ef4444;">${errorMsg}</span><br><span style="color:var(--muted);font-size:0.75rem;">Your app contract may have been revoked. Click "Fix access" to re-request.</span>`
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
    LOG('fixAccess — callback, status:', resp.status, resp.errors || '')
    if (resp.status === 'approved') {
      LOG('fixAccess — contract re-approved, retrying readMessages')
      message.innerHTML = `<span style="color:#22c55e;">Access restored.</span>`
      readMessages()
    } else {
      LOG_ERR('fixAccess — failed:', resp.status, resp.errors)
      showFixAccess(`Fix access failed: ${resp.errors?.[0] || resp.status}`)
    }
  })
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function displayMessages(docs) {
  LOG('displayMessages — rendering', docs ? docs.length : 0, 'messages')
  if (!docs || docs.length === 0) {
    messageview.innerHTML = '<p class="empty">No messages yet — send one above.</p>'
    return
  }
  messageview.innerHTML = docs
    .slice()
    .sort((a, b) => new Date(b.body?.date) - new Date(a.body?.date))
    .map((doc) => {
      const b = doc.body || {}
      const date = b.date ? new Date(b.date).toLocaleString() : ''
      const from = `${b.from_username || '?'}/${b.from_provider || '?'}`
      // Only the author can delete (the API scopes delete to the author), so
      // the button renders only on my own messages.
      const mine = doc.author_key === ME.username
      const delBtn = mine
        ? `<button class="danger" onclick="deleteMessage('${doc.doc_id}')">Delete</button>`
        : ''
      return `<div class="message" data-testid="message">
        <div class="message-meta">
          <span class="message-from">from ${escapeHtml(from)}</span>
          <span>${escapeHtml(date)}</span>
        </div>
        <p class="message-text" data-testid="message-text">${escapeHtml(b.text || '')}</p>
        ${delBtn ? `<div class="message-actions">${delBtn}</div>` : ''}
      </div>`
    })
    .join('')
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
      name: 'Messages',
      description: 'A DM-style demo: send messages between web10 users. Each conversation is a group.',
    },
  }),
}).catch(() => {})

// ---------------------------------------------------------------------------
// Restore session on page load
// ---------------------------------------------------------------------------
if (w.isSignedIn()) {
  LOG('page load — already signed in')
  initApp()
} else {
  LOG('page load — not signed in, showing login button')
}