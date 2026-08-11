/* messages demo — script.js (v3 with groups) */

const ERROR_MSGS = {
  read: "Failed to read messages",
  send: "Failed to send message",
  delete: "Failed to delete message",
}

const AUTH_ORIGIN = "https://auth.web10.app"
const w = window.web10.createV3Client({ apiOrigin: 'https://api.web10.app' })

// v3 API helpers — all v3 endpoints are POST with { token, ...params }
const API_ORIGIN = "https://api.web10.app"
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

// v3: add an app contract so this origin can read/write the service
async function ensureAppContract() {
  const origin = window.location.origin
  try {
    const token = document.cookie.match(/token=([^;]+)/)?.[1]
    if (!token) return
    await fetch(`${API_ORIGIN}/v3/app-contracts/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        allowed_origin: origin,
        permissions: { [SERVICE]: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      }),
    })
  } catch {
    // Contract might already exist — not an error
  }
}

// v3: ensure a DM group exists between two users, create if not
async function ensureDmGroup(myUsername, theirUsername, provider) {
  const groupName = `dm-${myUsername}-${theirUsername}`
  const groupId = `${provider}/groups/users/${myUsername}/${groupName}`
  try {
    // Check if we're already a member
    const groups = await v3Post('groups/list', {})
    const existing = groups.find(g => g.group_id === groupId)
    if (existing) return groupId
  } catch {
    // groups/list might fail — try to create
  }

  // Create the DM group (open policy, both users as members)
  try {
    await v3Post('groups/create', {
      name: groupName,
      join_policy: 'invite_only',
      roles: [
        { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
        { name: 'member', services: [SERVICE], permissions: ['readAll', 'create', 'deleteOwn'] },
      ],
      members: [
        { member_key: myUsername, role: 'owner' },
        { member_key: theirUsername, role: 'member' },
      ],
    })
    return groupId
  } catch (err) {
    console.warn('Failed to create DM group:', err)
    return null
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

  // Default recipient: yourself, so the demo round-trips with one login
  toUsername.value = t.username
  toProvider.value = t.provider

  // v3: ensure the app contract exists, then load messages
  ensureAppContract().then(() => readMessages()).catch(() => readMessages())
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

async function sendMessage() {
  const toUser = toUsername.value.trim()
  const toProv = toProvider.value.trim()
  const text = body.value.trim()
  if (!toUser || toProv || !text) return

  const t = w.readToken()
  const payload = {
    from_username: t.username,
    from_provider: t.provider,
    to_username: toUser,
    to_provider: toProv,
    text,
    date: new Date().toISOString(),
  }

  try {
    // v3: ensure a DM group exists for this conversation
    const groupId = await ensureDmGroup(t.username, toUser, t.provider)

    // v3: create the message document, attached to the DM group
    await v3Post('create', {
    service: SERVICE,
    body: payload,
      groups: groupId ? [groupId] : undefined,
    })

    body.value = ""
    message.innerHTML = `Sent to <strong>${toUser}/${toProv}</strong>`

    // If you sent to yourself, your inbox just gained the message
    if (toUser === t.username && toProv === t.provider) readMessages()
  } catch (err) {
    console.error(ERROR_MSGS.send, err)
    message.innerHTML = ERROR_MSGS.send
  }
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
