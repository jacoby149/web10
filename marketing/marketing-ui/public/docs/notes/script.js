/* script.js — notes demo */

const LOG = (...args) => console.log('[notes-demo]', ...args)
const LOG_ERR = (...args) => console.error('[notes-demo]', ...args)

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
const AUTH_ORIGIN = isLocal ? 'http://auth.localhost' : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const API_ORIGIN = isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app'

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

  LOG('requesting group creation via contractRequest')
  w.contractRequest([{
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
  }], AUTH_ORIGIN, (resp) => {
    LOG('group contractRequest callback — status:', resp.status)
    if (resp.errors) LOG('group contractRequest errors:', JSON.stringify(resp.errors))
    if (resp.status === 'approved') {
      LOG('notes group CREATED')
      message.innerHTML += `<br><span style="color:#22c55e;">notes group created</span>`
    } else if (resp.status === 'denied') {
      LOG_ERR('group creation DENIED')
      message.innerHTML += `<br><span style="color:#ef4444;">group creation denied</span>`
    } else {
      LOG_ERR('group creation FAILED:', resp.errors?.[0] || 'unknown')
      message.innerHTML += `<br><span style="color:#ef4444;">group creation failed: ${resp.errors?.[0] || 'unknown'}</span>`
    }
    // Group might already exist — proceed either way
    LOG('proceeding to initApp regardless of group creation result')
    editor.style.display = 'block'
    initApp()
  })
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
    message.innerHTML = `failed to read notes: ${e.message}`
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
    message.innerHTML = `failed to create note: ${e.message}`
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
    message.innerHTML = `failed to update note: ${e.message}`
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
    message.innerHTML = `failed to delete note: ${e.message}`
  }
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
