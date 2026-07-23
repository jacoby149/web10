/* notes demo — script.js */

const ERROR_MSGS = {
  create: "Failed to create note",
  read: "Failed to read notes",
  update: "Failed to update note",
  delete: "Failed to delete note",
}

const wapi = wapiInit("https://auth.web10.app")

// cross_origins MUST list every origin this demo runs on. The token minted by
// the auth portal scopes `site` to the referrer's hostname (docs.web10.app in
// prod), and `is_permitted` only lets it through via
// `is_in_cross_origins(token.site, …)` — `docs.web10.app` is NOT in
// `CORS_SERVICE_MANAGERS`, so an omitted/wrong entry 401s every CRUD call.
// `localhost` / `docs.localhost` cover `bun dev` and the docker-compose vhost.
// `dev.web10.app` / `www.dev.web10.app` cover the dev deployment, where the
// marketing-ui stack serves the docs pages (see ubuntu-deployment/README.md:
// marketing-ui dev vhosts are dev.web10.app + www.dev.web10.app).
const sirs = [
  {
    service: "web10-docs-note-demo",
    cross_origins: ["docs.web10.app", "dev.web10.app", "www.dev.web10.app", "localhost", "docs.localhost"],
  },
]

wapi.SMROnReady(sirs, [])
authButton.onclick = wapi.openAuthPortal

// Listen for the token the auth portal posts back, even when we're already
// signed in. Returning users who authenticated elsewhere (e.g. the hello demo)
// have a token cookie but no notes contract; their first `read` 401s and we
// re-open the auth portal, where they approve the contract. Once approved, the
// portal sends a fresh tiered token here — `authListen` swaps it in and re-runs
// `initApp`, so readNotes retries against the now-authorized service.
wapi.authListen(() => initApp())

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

/* CRUD */

function readNotes() {
  wapi
    .read("web10-docs-note-demo", {})
    .then((res) => displayNotes(res.data))
    .catch((err) => promptContract(ERROR_MSGS.read, err))
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
    .catch((err) => promptContract(ERROR_MSGS.create, err))
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

// A signed-in visitor whose token doesn't include the notes service contract
// gets `401 crud access denied` on every CRUD op because no terms record
// authorizes their `site`. Re-open the auth portal — it shows the consent/
// contract flow for the SIR registered via SMROnReady, then posts a fresh
// scoped token back here, which `authListen` swaps in and `initApp` re-runs.
// (We re-point the auth button to `openAuthPortal`: at this point it reads
// "Log out", which is useless to a user who hasn't granted the contract yet.)
function promptContract(label, err) {
  console.error(label, err)
  authButton.innerHTML = "Open auth portal"
  authButton.onclick = wapi.openAuthPortal
  message.innerHTML =
    `${label}. <strong>Set up the notes contract</strong> with web10 first — ` +
    `click <code>Open auth portal</code> above, approve the request, and you're in.`
  noteview.innerHTML = '<p class="empty">Approve the notes contract in the auth portal to begin.</p>'
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