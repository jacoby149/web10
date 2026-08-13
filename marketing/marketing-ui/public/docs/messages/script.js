/* messages demo — script.js (v3 with groups) */

const ERROR_MSGS = {
  read: "Failed to read messages",
  send: "Failed to send message",
  delete: "Failed to delete message",
}

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
const AUTH_ORIGIN = isLocal ? 'http://auth.localhost' : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const w = window.web10.createV3Client({ apiOrigin: isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app' })

// v3 API helpers — all v3 endpoints are POST with { token, ...params }
const API_ORIGIN = isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app'
const SERVICE = "web10-docs-message-demo"

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

  // Default recipient: yourself, so the demo round-trips with one login
  toUsername.value = t.username
  toProvider.value = t.provider

  // Request app contract for the messages service (App CR)
  w.contractRequest([{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      [SERVICE]: ['readAll', 'create', 'deleteOwn'],
    },
  }], AUTH_ORIGIN, (resp) => {
    if (resp.status === 'approved') {
      message.innerHTML += ` · <span style="color:var(--ok);">app contract approved</span>`
      readMessages()
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
      name: 'Messages',
      description: 'A DM-style demo: send messages between web10 nodes. Each conversation is a group.',
    },
  }),
}).catch(() => {})

if (w.isSignedIn()) initApp()

// v3: ensure a DM group exists between two users via Group CR
function ensureDmGroup(myUsername, theirUsername, provider, callback) {
  const sorted = [myUsername, theirUsername].sort()
  const groupName = `dm-${sorted[0]}-${sorted[1]}`
  const groupId = `${provider}/groups/users/${myUsername}/${groupName}`

  w.contractRequest([{
    kind: 'group',
    app_origin: window.location.origin,
    action: 'create_group',
    name: groupName,
    join_policy: 'invite_only',
    roles: [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
      { name: 'member', services: [SERVICE], permissions: ['readAll', 'create', 'deleteOwn'] },
    ],
    members: [
      { member_key: myUsername, role: 'owner' },
      { member_key: theirUsername, role: 'owner' },
    ],
  }], AUTH_ORIGIN, (resp) => {
    if (resp.status === 'approved' || resp.status === 'denied') {
      // Group created or already exists
      callback(groupId)
    } else {
      // Error or group already exists — use the ID anyway
      callback(groupId)
    }
  })
}

/* Send + Read (v3 with groups) */

function readMessages() {
  // v3: read messages from the collection, scoped to groups the user belongs to
  v3Post('read', {
    service: SERVICE,
    groups: ['me'],
  })
    .then(displayMessages)
    .catch((err) => {
      console.error(ERROR_MSGS.read, err)
      message.innerHTML = ERROR_MSGS.read
    })
}

function sendMessage() {
  const toUser = toUsername.value.trim()
  const toProv = toProvider.value.trim()
  const text = document.getElementById('body').value.trim()
  if (!toUser || !text) return

  const t = w.readToken()
  const payload = {
    from_username: t.username,
    from_provider: t.provider,
    to_username: toUser,
    to_provider: toProv,
    text,
    date: new Date().toISOString(),
  }

  // v3: ensure a DM group exists for this conversation (via Group CR)
  ensureDmGroup(t.username, toUser, t.provider, (groupId) => {
    // v3: create the message document, attached to the DM group
    v3Post('create', {
      service: SERVICE,
      body: payload,
      groups: groupId ? [groupId] : undefined,
    })
      .then(() => {
        document.getElementById('body').value = ""
        message.innerHTML = `Sent to <strong>${toUser}/${toProv}</strong>`

        // If you sent to yourself, your inbox just gained the message
        if (toUser === t.username && toProv === t.provider) readMessages()
      })
      .catch((err) => {
        console.error(ERROR_MSGS.send, err)
        message.innerHTML = ERROR_MSGS.send
      })
  })
}

function deleteMessage(docId) {
  v3Post('delete', { doc_id: docId })
    .then(readMessages)
    .catch(() => {
      console.error(ERROR_MSGS.delete)
      message.innerHTML = ERROR_MSGS.delete
    })
}

/* Render */

function displayMessages(docs) {
  if (!docs || docs.length === 0) {
    messageview.innerHTML = '<p class="empty">No messages yet — send one above.</p>'
    return
  }
  messageview.innerHTML = docs
    .slice()
    .sort((a, b) => new Date(b.body?.date) - new Date(a.body?.date))
    .map((doc) => {
      const body = doc.body || {}
      const date = body.date ? new Date(body.date).toLocaleString() : ""
      const from = `${body.from_username || "?"}/${body.from_provider || "?"}`
      return `<div class="message">
        <div class="message-meta">
          <span class="message-from">from ${escapeHtml(from)}</span>
          <span>${escapeHtml(date)}</span>
        </div>
        <p class="message-text">${escapeHtml(body.text || "")}</p>
        <div class="message-actions">
          <button class="danger" onclick="deleteMessage('${doc.doc_id}')">Delete</button>
        </div>
      </div>`
    })
    .join("")
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}