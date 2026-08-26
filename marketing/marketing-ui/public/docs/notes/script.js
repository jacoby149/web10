/* script.js — notes demo */

const LOG = (...args) => console.log('[notes-demo]', ...args)
const LOG_ERR = (...args) => console.error('[notes-demo]', ...args)

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

const COLLECTION = 'notes'
let NOTES_GROUP = null

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
      [COLLECTION]: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
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
  LOG('token payload:', JSON.stringify(t, null, 2))
  if (!t) {
    LOG_ERR('authListen fired but readToken() returned null — cookie not set?')
    message.innerHTML += `<br><span style="color:#ef4444;">auth failed: no token in cookie</span>`
    return
  }

  const groupName = `notes-${t.username}`
  const groupId = `${t.provider}/groups/users/${t.username}/${groupName}`
  NOTES_GROUP = groupId
  LOG('NOTES_GROUP set to:', groupId)

  // D42: the group contract is LAZY — not sent on login. initApp() reads the
  // notes; a successful read is the confirmation (group is fine, no popup). If
  // the group is missing, the read 403s and a "Set up your notes group" button
  // appears. No more proactive group re-prompt on every return run.
  LOG('D42 — group contract is lazy; reading notes (the read is the test)')
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
  editor.style.display = 'block'
  readNotes()
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

async function readNotes() {
  LOG('readNotes — called')
  if (!NOTES_GROUP) {
    LOG('readNotes — NOTES_GROUP is null, waiting for group setup')
    message.innerHTML = 'setting up your notes group...'
    return
  }
  LOG('readNotes — querying collection:', COLLECTION, 'group:', NOTES_GROUP)
  try {
    const docs = await w.read(COLLECTION, { groups: [NOTES_GROUP] })
    LOG('readNotes — got', docs.length, 'docs')
    displayNotes(docs)
  } catch (e) {
    LOG_ERR('readNotes FAILED:', e.name, e.message, 'status:', e.status)
    if (isAppContractError(e)) {
      showFixAccess('Access denied — your app contract may have been revoked.')
    } else if (isGroupError(e)) {
      showSetupGroup('Your notes group is missing — set it up to see your notes.')
    } else {
      message.innerHTML = `failed to read notes: ${e.message}`
    }
  }
}

async function createNote() {
  const text = curr.value.trim()
  LOG('createNote — called, text length:', text.length)
  if (!text) {
    LOG('createNote — empty text, aborting')
    return
  }
  if (!NOTES_GROUP) {
    LOG_ERR('createNote — NOTES_GROUP is null')
    message.innerHTML = 'notes group not ready yet'
    return
  }
  const body = { note: text, date: new Date().toISOString() }
  LOG('createNote — body:', JSON.stringify(body))
  LOG('createNote — groups:', JSON.stringify([NOTES_GROUP]))
  try {
    const result = await w.create(COLLECTION, body, { groups: [NOTES_GROUP] })
    LOG('createNote — success, result:', JSON.stringify(result))
    curr.value = ''
    readNotes()
  } catch (e) {
    LOG_ERR('createNote FAILED:', e.name, e.message, 'status:', e.status)
    if (isAppContractError(e)) {
      showFixAccess('Cannot create — your app contract may have been revoked.')
    } else if (isGroupError(e)) {
      showSetupGroup('Cannot create — your notes group is missing.')
    } else {
      message.innerHTML = `failed to create note: ${e.message}`
    }
  }
}

async function updateNote(docId, text) {
  LOG('updateNote — docId:', docId, 'text length:', text.length)
  try {
    const result = await w.update(docId, { note: text })
    LOG('updateNote — success, result:', JSON.stringify(result))
    readNotes()
  } catch (e) {
    LOG_ERR('updateNote FAILED:', e.name, e.message, 'status:', e.status)
    if (isAppContractError(e)) {
      showFixAccess('Cannot update — your app contract may have been revoked.')
    } else if (isGroupError(e)) {
      showSetupGroup('Cannot update — your notes group is missing.')
    } else {
      message.innerHTML = `failed to update note: ${e.message}`
    }
  }
}

async function deleteNote(docId) {
  LOG('deleteNote — docId:', docId)
  try {
    const result = await w.delete(docId)
    LOG('deleteNote — success, result:', JSON.stringify(result))
    readNotes()
  } catch (e) {
    LOG_ERR('deleteNote FAILED:', e.name, e.message, 'status:', e.status)
    if (isAppContractError(e)) {
      showFixAccess('Cannot delete — your app contract may have been revoked.')
    } else if (isGroupError(e)) {
      showSetupGroup('Cannot delete — your notes group is missing.')
    } else {
      message.innerHTML = `failed to delete note: ${e.message}`
    }
  }
}

// ---------------------------------------------------------------------------
// Fix access — re-request contract when it's been revoked
// ---------------------------------------------------------------------------

// D42: the API returns distinguishable 403s so the demo shows the right button.
// App contract missing → "No app contract for {origin} …" → Fix access.
// Group missing / not a member → "not a member of the requested group" → Set up group.
// The SDK's Web10Error puts the API's detail in `e.details` (e.message is the
// generic "Request failed: 403 Forbidden"), so check both.
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
  message.innerHTML = `<span style="color:#ef4444;">${errorMsg}</span><br><span style="color:var(--muted);font-size:0.75rem;">Your app contract may have been revoked. Click "Fix access" to re-request.</span>`
}

function showSetupGroup(errorMsg) {
  LOG('showSetupGroup — showing setup button, error:', errorMsg)
  setupGroupBtn.style.display = 'inline-block'
  message.innerHTML = `<span style="color:#ef4444;">${errorMsg}</span><br><span style="color:var(--muted);font-size:0.75rem;">Your notes group is missing. Click "Set up your notes group" to create it.</span>`
}

fixAccessBtn.onclick = () => {
  LOG('fixAccessBtn clicked — opening auth portal to re-request contract')
  fixAccessBtn.style.display = 'none'
  window.web10.openAuthPortal(AUTH_ORIGIN)
  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      [COLLECTION]: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
    },
  }]
  LOG('fixAccess — sending app contract:', JSON.stringify(contract, null, 2))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('fixAccess — contractRequest callback, status:', resp.status)
    if (resp.status === 'approved') {
      LOG('fixAccess — contract re-approved, retrying readNotes')
      message.innerHTML = `<span style="color:#22c55e;">Access restored.</span><br>`
      readNotes()
    } else {
      LOG_ERR('fixAccess — contract request failed:', resp.status, resp.errors)
      showFixAccess(`Fix access failed: ${resp.errors?.[0] || resp.status}`)
    }
  })
}

// D42: the group contract is LAZY — requested only when a read 403s with
// "not a member". This button (a user gesture) opens a fresh, self-contained
// popup for the group contract. The login popup already closed, so this is a
// distinct window. handoff=none: the app already holds the token, so this
// popup is consent-only (it approves the group contract and closes).
setupGroupBtn.onclick = () => {
  LOG('setupGroupBtn clicked — opening auth portal to create the notes group')
  setupGroupBtn.style.display = 'none'
  const t = w.readToken()
  if (!t) {
    LOG_ERR('setupGroupBtn — no token, cannot create group')
    showSetupGroup('Not signed in — log in first.')
    return
  }
  window.web10.openAuthPortal(AUTH_ORIGIN, { handoff: 'none' })
  const groupName = `notes-${t.username}`
  const contract = [{
    kind: 'group',
    app_origin: window.location.origin,
    action: 'create_group',
    name: groupName,
    join_policy: 'invite_only',
    roles: [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
      { name: 'member', services: [COLLECTION], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
    ],
    members: [{ member_key: t.username, role: 'owner' }],
  }]
  LOG('setupGroup — sending group contract:', JSON.stringify(contract, null, 2))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('setupGroup — contractRequest callback, status:', resp.status)
    if (resp.errors) LOG('setupGroup — errors:', JSON.stringify(resp.errors))
    if (resp.status === 'approved') {
      LOG('setupGroup — group created, retrying readNotes')
      message.innerHTML = `<span style="color:#22c55e;">Notes group ready.</span><br>`
      readNotes()
    } else {
      LOG_ERR('setupGroup — contract request failed:', resp.status, resp.errors)
      showSetupGroup(`Failed to set up your notes group: ${resp.errors?.[0] || resp.status}`)
    }
  })
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function displayNotes(docs) {
  LOG('displayNotes — rendering', docs.length, 'notes')
  if (!docs.length) {
    noteview.innerHTML = '<p class="empty">no notes yet</p>'
    return
  }
  noteview.innerHTML = docs
    .sort((a, b) => new Date(b.body.date) - new Date(a.body.date))
    .map((doc) => {
      const id = doc.doc_id
      const escaped = doc.body.note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      return `<div class="note">
        <div class="note-date">${doc.body.date}</div>
        <textarea id="${id}">${escaped}</textarea>
        <div class="note-actions">
          <button class="secondary" onclick="updateNote('${id}', document.getElementById('${id}').value)">Update</button>
          <button class="danger" onclick="deleteNote('${id}')">Delete</button>
        </div>
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
    const groupName = `notes-${t.username}`
    const groupId = `${t.provider}/groups/users/${t.username}/${groupName}`
    NOTES_GROUP = groupId
    LOG('restored NOTES_GROUP:', groupId)
    initApp()
  } else {
    LOG_ERR('isSignedIn() true but readToken() is null — stale cookie?')
    w.signOut()
  }
} else {
  LOG('page load — not signed in, showing login button')
}
