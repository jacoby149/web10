/* notes demo — script.js (v3 with groups) */

const ERROR_MSGS = {
  create: "Failed to create note",
  read: "Failed to read notes",
  update: "Failed to update note",
  delete: "Failed to delete note",
}

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
const AUTH_ORIGIN = isLocal ? 'http://auth.localhost' : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const w = window.web10.createV3Client({ apiOrigin: isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app' })

// v3 API helpers — all v3 endpoints are POST with { token, ...params }
const API_ORIGIN = isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app'
const SERVICE = "web10-docs-note-demo"

let NOTES_GROUP = null // personal group for notes, set after auth

async function v3Post(action, params = {}) {
  const token = document.cookie.match(/token=([^;]+)/)?.[1]
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(`${API_ORIGIN}/v3/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...params }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`v3 ${action}: ${res.status} ${text}`)
  }
  return res.json()
}

authButton.onclick = () => window.web10.openAuthPortal(AUTH_ORIGIN)
window.web10.authListen(() => initApp())

function initApp() {
  authButton.innerHTML = "Log out"
  authButton.onclick = () => {
    w.signOut()
    window.location.reload()
  }
  const t = w.readToken()
  message.innerHTML = `Signed in as <strong>${t["provider"]}/${t["username"]}</strong>`
  editor.style.display = "block"

  // Request app contract for the notes service (App CR)
  w.contractRequest([{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      [SERVICE]: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
    },
  }], AUTH_ORIGIN, (resp) => {
    if (resp.status === 'approved') {
      message.innerHTML += ` · <span style="color:var(--ok);">app contract approved</span>`
      ensureNotesGroup(t.username, t.provider)
    } else if (resp.status === 'denied') {
      message.innerHTML += ` · <span style="color:var(--danger);">app contract denied</span>`
    } else {
      message.innerHTML += ` · <span style="color:var(--danger);">contract error: ${resp.errors?.[0] || 'unknown'}</span>`
    }
  })
}

// Self-register in the app store (no auth required)
fetch(`${API_ORIGIN}/v3/apps/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    body: {
      url: `${window.location.origin}${window.location.pathname}`,
      name: 'Notes',
      description: 'A CRUD demo: create, read, update, and delete notes stored in your own web10 collection.',
    },
  }),
}).catch(() => {})

if (w.isSignedIn()) initApp()

// v3: ensure a personal notes group exists via Group CR
function ensureNotesGroup(username, provider) {
  const groupName = `notes-${username}`

  // Request group creation via contract request (Group CR)
  w.contractRequest([{
    kind: 'group',
    app_origin: window.location.origin,
    action: 'create_group',
    name: groupName,
    join_policy: 'invite_only',
    roles: [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
      { name: 'member', services: [SERVICE], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
    ],
    members: [{ member_key: username, role: 'owner' }],
  }], AUTH_ORIGIN, (resp) => {
    const groupId = `${provider}/groups/users/${username}/${groupName}`
    if (resp.status === 'approved') {
      NOTES_GROUP = groupId
      message.innerHTML += ` · <span style="color:var(--ok);">notes group created</span>`
      readNotes()
    } else if (resp.status === 'denied') {
      NOTES_GROUP = groupId
      message.innerHTML += ` · <span style="color:var(--danger);">group creation denied</span>`
      readNotes()
    } else {
      // Group might already exist — try to read notes anyway
      NOTES_GROUP = groupId
      readNotes()
    }
  })
}

/* CRUD with groups (v3) */

function readNotes() {
  if (!NOTES_GROUP) {
    message.innerHTML = 'Setting up your notes group...'
    return
  }
  // v3: read from the personal notes group
  v3Post('read', {
    service: SERVICE,
    groups: [NOTES_GROUP],
  })
    .then(displayNotes)
    .catch((err) => {
      console.error(ERROR_MSGS.read, err)
      message.innerHTML = ERROR_MSGS.read
    })
}

function createNote() {
  const text = curr.value.trim()
  if (!text || !NOTES_GROUP) return
  v3Post('create', {
    service: SERVICE,
    body: { note: text, date: new Date().toISOString() },
    // v3: attach to the personal notes group
    groups: [NOTES_GROUP],
  })
    .then(() => {
      readNotes()
      curr.value = ""
    })
    .catch((err) => {
      console.error(ERROR_MSGS.create, err)
      message.innerHTML = ERROR_MSGS.create
    })
}

function updateNote(docId) {
  const el = document.getElementById(`note-${docId}`)
  const text = el ? el.value : ""
  v3Post('update', {
    doc_id: docId,
    body: { note: text },
  })
    .then(readNotes)
    .catch(() => {
      console.error(ERROR_MSGS.update)
      message.innerHTML = ERROR_MSGS.update
    })
}

function deleteNote(docId) {
  v3Post('delete', { doc_id: docId })
    .then(readNotes)
    .catch(() => {
      console.error(ERROR_MSGS.delete)
      message.innerHTML = ERROR_MSGS.delete
    })
}

/* Render */

function displayNotes(docs) {
  if (!docs || docs.length === 0) {
    noteview.innerHTML = '<p class="empty">No notes yet — write one above.</p>'
    return
  }
  noteview.innerHTML = docs
    .slice()
    .reverse()
    .map((doc) => {
      const body = doc.body || {}
      const date = body.date ? new Date(body.date).toLocaleString() : ""
      return `<div class="note">
        <p class="note-date">${date}</p>
        <textarea id="note-${doc.doc_id}">${escapeHtml(body.note || "")}</textarea>
        <div class="note-actions">
          <button class="secondary" onclick="updateNote('${doc.doc_id}')">Update</button>
          <button class="danger" onclick="deleteNote('${doc.doc_id}')">Delete</button>
        </div>
      </div>`
    })
    .join("")
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}