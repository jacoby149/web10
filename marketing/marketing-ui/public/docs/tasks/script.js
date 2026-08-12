/* tasks demo — script.js (v3 with groups) */

const ERROR_MSGS = {
  createGroup: "Failed to create group",
  readTasks: "Failed to read tasks",
  createTask: "Failed to create task",
  updateTask: "Failed to update task",
  deleteTask: "Failed to delete task",
  inviteMember: "Failed to invite member",
  listMembers: "Failed to list members",
}

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
const AUTH_ORIGIN = isLocal ? 'http://auth.localhost' : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const w = window.web10.createV3Client({ apiOrigin: isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app' })

const API_ORIGIN = isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app'
const SERVICE = "web10-docs-task-demo"

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
    // Contract might already exist
  }
}

let currentGroupId = null

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
  app.style.display = "block"

  ensureAppContract().then(() => readTasks()).catch(() => readTasks())
}

// Self-register in the app store
fetch(`${API_ORIGIN}/v3/apps/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    body: {
      url: `${window.location.origin}${window.location.pathname}`,
      name: 'Tasks',
      description: 'A groups demo: create a group with roles, add tasks, and invite members.',
    },
  }),
}).catch(() => {})

if (w.isSignedIn()) initApp()

/* Group operations */

async function createGroup() {
  const name = groupName.value.trim()
  const joinPolicy = joinPolicy.value
  if (!name) return

  const t = w.readToken()
  try {
    const result = await v3Post('groups/create', {
      name,
      join_policy: joinPolicy,
      roles: [
        { name: 'owner', services: [SERVICE], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
        { name: 'contributor', services: [SERVICE], permissions: ['readAll', 'create', 'updateOwn'] },
        { name: 'viewer', services: [SERVICE], permissions: ['readAll'] },
      ],
      members: [
        { member_key: t.username, role: 'owner' },
      ],
    })
    currentGroupId = result.group_id
    activeGroup.style.display = 'block'
    groupSection.style.display = 'none'
    groupId.textContent = currentGroupId
    readTasks()
    readMembers()
  } catch (err) {
    console.error(ERROR_MSGS.createGroup, err)
    message.innerHTML = ERROR_MSGS.createGroup
  }
}

/* Task CRUD (attached to group) */

function readTasks() {
  if (!currentGroupId) return
  v3Post('read', {
    service: SERVICE,
    groups: [currentGroupId],
  })
    .then(displayTasks)
    .catch((err) => {
      console.error(ERROR_MSGS.readTasks, err)
    })
}

function createTask() {
  const text = taskText.value.trim()
  if (!text || !currentGroupId) return
  v3Post('create', {
    service: SERVICE,
    body: { text, done: false, date: new Date().toISOString() },
    groups: [currentGroupId],
  })
    .then(() => {
      readTasks()
      taskText.value = ""
    })
    .catch((err) => {
      console.error(ERROR_MSGS.createTask, err)
      message.innerHTML = ERROR_MSGS.createTask
    })
}

function toggleTask(docId, done) {
  v3Post('update', {
    doc_id: docId,
    body: { done: !done },
  })
    .then(readTasks)
    .catch(() => {
      console.error(ERROR_MSGS.updateTask)
      message.innerHTML = ERROR_MSGS.updateTask
    })
}

function deleteTask(docId) {
  v3Post('delete', { doc_id: docId })
    .then(readTasks)
    .catch(() => {
      console.error(ERROR_MSGS.deleteTask)
      message.innerHTML = ERROR_MSGS.deleteTask
    })
}

/* Members */

function readMembers() {
  if (!currentGroupId) return
  v3Post('groups/members/list', { group_id: currentGroupId })
    .then(displayMembers)
    .catch((err) => {
      console.error(ERROR_MSGS.listMembers, err)
    })
}

function inviteMember() {
  const username = inviteUsername.value.trim()
  const role = inviteRole.value
  if (!username || !currentGroupId) return
  v3Post('groups/invite', {
    group_id: currentGroupId,
    member_key: username,
    role,
  })
    .then(() => {
      inviteUsername.value = ""
      readMembers()
    })
    .catch((err) => {
      console.error(ERROR_MSGS.inviteMember, err)
      message.innerHTML = ERROR_MSGS.inviteMember
    })
}

/* Render */

function displayTasks(docs) {
  if (!docs || docs.length === 0) {
    taskview.innerHTML = '<p class="empty">No tasks yet — add one above.</p>'
    return
  }
  taskview.innerHTML = docs
    .slice()
    .reverse()
    .map((doc) => {
      const body = doc.body || {}
      const done = !!body.done
      return `<div class="task">
        <input type="checkbox" ${done ? 'checked' : ''} onchange="toggleTask('${doc.doc_id}', ${done})" />
        <span class="task-text ${done ? 'done' : ''}">${escapeHtml(body.text || "")}</span>
        <div class="task-actions">
          <button class="danger" onclick="deleteTask('${doc.doc_id}')">Del</button>
        </div>
      </div>`
    })
    .join("")
}

function displayMembers(members) {
  if (!members || members.length === 0) {
    memberlist.innerHTML = '<p class="empty">No members yet.</p>'
    return
  }
  memberlist.innerHTML = members
    .map((m) => `<div class="member">
      <span>${escapeHtml(m.member_key)}</span>
      <span class="member-role">${escapeHtml(m.role)}</span>
    </div>`)
    .join("")
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}