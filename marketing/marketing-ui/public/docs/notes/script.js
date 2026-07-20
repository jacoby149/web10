/* notes demo — script.js */

const ERROR_MSGS = {
  create: "Failed to create note",
  read: "Failed to read notes",
  update: "Failed to update note",
  delete: "Failed to delete note",
}

const wapi = wapiInit("https://auth.web10.app")

const sirs = [
  {
    service: "web10-docs-note-demo",
    cross_origins: ["auth.web10.app", "web10.app", "www.web10.app"],
  },
]

wapi.SMROnReady(sirs, [])
authButton.onclick = wapi.openAuthPortal

function initApp() {
  authButton.innerHTML = "Log out"
  authButton.onclick = () => {
    wapi.signOut()
    window.location.reload()
  }
  const t = wapi.readToken()
  message.innerHTML = `Signed in as <strong>${t["provider"]}/${t["username"]}</strong>`
  editor.style.display = "block"
  readNotes()
}

if (wapi.isSignedIn()) initApp()
else wapi.authListen(initApp)

/* CRUD */

function readNotes() {
  wapi
    .read("web10-docs-note-demo", {})
    .then((res) => displayNotes(res.data))
    .catch(() => (message.innerHTML = ERROR_MSGS.read))
}

function createNote() {
  const text = curr.value.trim()
  if (!text) return
  wapi
    .create("web10-docs-note-demo", { note: text, date: new Date().toISOString() })
    .then(() => {
      readNotes()
      curr.value = ""
    })
    .catch(() => (message.innerHTML = ERROR_MSGS.create))
}

function updateNote(id) {
  const el = document.getElementById(`note-${id}`)
  const text = el ? el.value : ""
  wapi
    .update("web10-docs-note-demo", { _id: id }, { $set: { note: text } })
    .then(readNotes)
    .catch(() => (message.innerHTML = ERROR_MSGS.update))
}

function deleteNote(id) {
  wapi
    .delete("web10-docs-note-demo", { _id: id })
    .then(readNotes)
    .catch(() => (message.innerHTML = ERROR_MSGS.delete))
}

/* Render */

function displayNotes(data) {
  if (!data || data.length === 0) {
    noteview.innerHTML = '<p class="empty">No notes yet — write one above.</p>'
    return
  }
  noteview.innerHTML = data
    .slice()
    .reverse()
    .map((n) => {
      const date = n.date ? new Date(n.date).toLocaleString() : ""
      return `<div class="note">
        <p class="note-date">${date}</p>
        <textarea id="note-${String(n._id)}">${escapeHtml(n.note || "")}</textarea>
        <div class="note-actions">
          <button class="secondary" onclick="updateNote('${String(n._id)}')">Update</button>
          <button class="danger" onclick="deleteNote('${String(n._id)}')">Delete</button>
        </div>
      </div>`
    })
    .join("")
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}