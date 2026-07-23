/* messages demo — script.js */

const SERVICE = "web10-docs-message-demo"

const ERROR_MSGS = {
  read: "Failed to read messages",
  send: "Failed to send message",
  delete: "Failed to delete message",
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
    service: SERVICE,
    cross_origins: ["docs.web10.app", "dev.web10.app", "www.dev.web10.app", "localhost", "docs.localhost"],
  },
]

wapi.SMROnReady(sirs, [])
authButton.onclick = wapi.openAuthPortal

// Returning users who authenticated elsewhere (e.g. the hello demo) have a
// token cookie but no messages contract; their first `read` 401s and we
// re-open the auth portal, where they approve the contract. Once approved, the
// portal sends a fresh tiered token here — `authListen` swaps it in and re-runs
// `initApp`, so readMessages retries against the now-authorized service.
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
  // Default recipient: yourself, so the demo round-trips with one login —
  // writing to your own node is covered by the contract you just approved.
  // Sending to a friend requires THEM to grant your site the messages contract.
  toUsername.value = t.username
  toProvider.value = t.provider
  readMessages()
}

if (wapi.isSignedIn()) initApp()

/* Send + Read */

function readMessages() {
  // Read what's addressed to you from YOUR OWN node. Other people's writes
  // into your `web10-docs-message-demo` land here once they've been granted
  // `create` access (the same fan-out delivery model as the inbox service).
  wapi
    .read(SERVICE, {})
    .then(displayMessages)
    .catch((err) => promptContract(ERROR_MSGS.read, err))
}

function sendMessage() {
  const toUser = toUsername.value.trim()
  const toProv = toProvider.value.trim()
  const text = body.value.trim()
  if (!toUser || !toProv || !text) return
  const t = wapi.readToken()
  const payload = {
    from_username: t.username,
    from_provider: t.provider,
    to_username: toUser,
    to_provider: toProv,
    text,
    date: new Date().toISOString(),
  }
  // Sends by writing the record to the RECIPIENT's node. Defaults to yourself
  // (covered by your own contract); other recipients must approve your site
  // into their `web10-docs-message-demo` terms whitelist or this will 401/403.
  wapi
    .create(SERVICE, payload, toUser, toProv)
    .then(() => {
      body.value = ""
      message.innerHTML = `Sent to <strong>${toUser}/${toProv}</strong>`
      // If you sent to yourself, your inbox just gained the message.
      if (toUser === t.username && toProv === t.provider) readMessages()
    })
    .catch((err) => promptContract(ERROR_MSGS.send, err))
}

function deleteMessage(id) {
  wapi
    .delete(SERVICE, { _id: id })
    .then(readMessages)
    .catch(() => (message.innerHTML = ERROR_MSGS.delete))
}

// A signed-in visitor whose token doesn't include the messages service contract
// gets `401 crud access denied` on every op because no terms record authorizes
// their `site`. Re-open the auth portal — it shows the consent/contract flow
// for the SIR registered via SMROnReady, then posts a fresh scoped token back
// here, which `authListen` swaps in and `initApp` re-runs.
// (We re-point the auth button to `openAuthPortal`: at this point it reads
// "Log out", which is useless to a user who hasn't granted the contract yet.)
function promptContract(label, err) {
  console.error(label, err)
  authButton.innerHTML = "Open auth portal"
  authButton.onclick = wapi.openAuthPortal
  message.innerHTML =
    `${label}. <strong>Set up the messages contract</strong> with web10 first — ` +
    `click <code>Open auth portal</code> above, approve the request, and you're in.`
  messageview.innerHTML = '<p class="empty">Approve the messages contract in the auth portal to begin.</p>'
}

/* Render */

function displayMessages(data) {
  if (!data || data.length === 0) {
    messageview.innerHTML = '<p class="empty">No messages yet — send one above.</p>'
    return
  }
  messageview.innerHTML = data
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((m) => {
      const date = m.date ? new Date(m.date).toLocaleString() : ""
      const from = `${m.from_username || "?"}/${m.from_provider || "?"}`
      return `<div class="message">
        <div class="message-meta">
          <span class="message-from">from ${escapeHtml(from)}</span>
          <span>${escapeHtml(date)}</span>
        </div>
        <p class="message-text">${escapeHtml(m.text || "")}</p>
        <div class="message-actions">
          <button class="danger" onclick="deleteMessage('${String(m._id)}')">Delete</button>
        </div>
      </div>`
    })
    .join("")
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}