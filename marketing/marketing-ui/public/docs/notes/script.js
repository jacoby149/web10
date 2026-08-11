/* notes demo — script.js (v3 with groups) */

const ERROR_MSGS = {
  create: "Failed to create note",
  read: "Failed to read notes",
  update: "Failed to update note",
  delete: "Failed to delete note",
}

const AUTH_ORIGIN = "https://auth.web10.app"
const w = window.web10.createV3Client({ apiOrigin: 'https://api.web10.app' })

// v3 API helpers — all v3 endpoints are POST with { token, ...params }
const API_ORIGIN = "https://api.web10.app"
const COLLECTION = "web10-docs-note-demo"
const PUBLIC_GROUP = "web10.app/groups/web10/discover"

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

// v3: add a service contract so the API allows this origin
async function ensureServiceContract() {
  const origin = window.location.origin
  try {
    await v3Post('service-contracts/add', {
      service_name: COLLECTION,
      allowed_origin: origin,
    })
  } catch {
    // Contract might already exist — not an error
  }
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

  // v3: ensure the service contract exists, then load notes
  ensureServiceContract().then(() => readNotes()).catch(() => readNotes())
}

if (w.isSignedIn()) initApp()

/* CRUD with groups (v3) */

function readNotes() {
  // v3: read from the collection, scoped to groups the user belongs to
  // "me" resolves to all groups the user is a member of
  v3Post('read', {
    collection: COLLECTION,
    groups: ['me'],
  })
    .then(displayNotes)
    .catch((err) => {
      console.error(ERROR_MSGS.read, err)
      message.innerHTML = ERROR_MSGS.read
    })
}

function createNote() {
  const text = curr.value.trim()
  if (!text) return
  v3Post('create', {
    collection: COLLECTION,
    body: { note: text, date: new Date().toISOString() },
    // v3: attach to the public discover group so notes appear in discover
    groups: [PUBLIC_GROUP],
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
