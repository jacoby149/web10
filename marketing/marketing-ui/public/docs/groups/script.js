/* groups demo — script.js (v3) */

const ERROR_MSGS = {
  create: "Failed to create group",
  list: "Failed to load groups",
  members: "Failed to load members",
  post: "Failed to post",
  read: "Failed to load posts",
  invite: "Failed to invite",
  join: "Failed to join",
  leave: "Failed to leave",
  requests: "Failed to load join requests",
  approve: "Failed to approve",
  deny: "Failed to deny",
}

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
// non-80 port; the origins must carry the same port. Empty on :80.
const portSuffix = window.location.port ? `:${window.location.port}` : ''
const AUTH_ORIGIN = isLocal ? `http://auth.localhost${portSuffix}` : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const w = window.web10.createV3Client({ apiOrigin: isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app' })

const API_ORIGIN = isLocal ? `http://api.localhost${portSuffix}` : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app'
const SERVICE = "web10-docs-groups-demo"

const ROLE_PRESETS = {
  community: [
    { name: 'owner', permissions: { '*': ['readAll','create','updateOwn','updateAll','deleteOwn','deleteAll','hideAll'], 'group': ['manageRoles','assignRoles','revokeRoles','deleteGroup'] } },
    { name: 'moderator', permissions: { 'posts': ['readAll','create','updateOwn','deleteOwn','hideAll'], 'comments': ['readAll','create','updateOwn','deleteOwn','hideAll'], 'group': ['assignRoles','revokeRoles'] } },
    { name: 'member', permissions: { 'posts': ['readAll','create','updateOwn','deleteOwn'], 'comments': ['readAll','create','updateOwn','deleteOwn'] } },
  ],
  followers: [
    { name: 'owner', permissions: { '*': ['readAll','create','updateOwn','updateAll','deleteOwn','deleteAll','hideAll'], 'group': ['manageRoles','assignRoles','revokeRoles','deleteGroup'] } },
    { name: 'member', permissions: { 'posts': ['readAll'] } },
  ],
  close: [
    { name: 'owner', permissions: { '*': ['readAll','create','updateOwn','updateAll','deleteOwn','deleteAll','hideAll'], 'group': ['manageRoles','assignRoles','revokeRoles','deleteGroup'] } },
    { name: 'member', permissions: { 'posts': ['readAll','create','updateOwn','deleteOwn'], 'comments': ['readAll','create','updateOwn','deleteOwn'] } },
  ],
}

let myGroupsCache = []
let manageGroupsCache = []

async function v3Post(action, params = {}) {
  const token = document.cookie.match(/token=([^;]+)/)?.[1]
  console.log('[demo] v3Post —', action, 'token:', token ? 'present' : 'MISSING')
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(`${API_ORIGIN}/v3/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...params }),
  })
  console.log('[demo] v3Post —', action, 'res.status:', res.status)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`v3 ${action}: ${res.status} ${text}`)
  }
  return res.json()
}

authButton.onclick = () => {
  console.log('[demo] authButton clicked — opening popup + sending contract')
  window.web10.openAuthPortal(AUTH_ORIGIN)
  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      [SERVICE]: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
      posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
    },
  }]
  console.log('[demo] calling contractRequest with:', JSON.stringify(contract))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    console.log('[demo] contractRequest callback — status:', resp.status, 'errors:', resp.errors)
    if (resp.status === 'approved') {
      message.innerHTML += ` · <span style="color:var(--ok);">app contract approved</span>`
    } else if (resp.status === 'denied') {
      message.innerHTML += ` · <span style="color:var(--danger);">app contract denied</span>`
    } else {
      message.innerHTML += ` · <span style="color:var(--danger);">contract error: ${resp.errors?.[0] || 'unknown'}</span>`
    }
    loadMyGroups()
    loadManageGroups()
  })
}
window.web10.authListen(() => {
  initApp()
  window.web10.closeAuthPopup()
})

function initApp() {
  authButton.innerHTML = "Log out"
  authButton.onclick = () => { w.signOut(); window.location.reload() }
  const t = w.readToken()
  message.innerHTML = `Signed in as <strong>${t["provider"]}/${t["username"]}</strong>`
  app.classList.remove('hidden')
  loadMyGroups()
  loadManageGroups()
}

// Self-register
fetch(`${API_ORIGIN}/v3/apps/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    body: {
      url: `${window.location.origin}${window.location.pathname}`,
      name: 'Groups',
      description: 'Create communities, manage members, post to groups, and discover content. Groups are policy containers.',
    },
  }),
}).catch(() => {})

if (w.isSignedIn()) initApp()

// ── Tabs ──────────────────────────────────────────────────────────────

function showTab(name) {
  ;['my','manage','create','board'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== name)
  })
  document.querySelectorAll('.tabs button').forEach((btn, i) => {
    const tabs = ['my','manage','create','board']
    btn.classList.toggle('active', tabs[i] === name)
  })
  if (name === 'board') populateBoardSelects()
}

// ── Toast ─────────────────────────────────────────────────────────────

function toast(msg, type) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = 'toast show ' + (type || '')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.className = 'toast', 3000)
}

// ── Groups ────────────────────────────────────────────────────────────

async function loadMyGroups() {
  try {
    myGroupsCache = await v3Post('groups/list', {})
    renderGroups('myGroups', myGroupsCache, false)
  } catch (e) { toast(ERROR_MSGS.list + ': ' + e.message, 'err') }
}

async function loadManageGroups() {
  try {
    manageGroupsCache = await v3Post('groups/manages', {})
    renderGroups('manageGroups', manageGroupsCache, true)
  } catch (e) { toast(ERROR_MSGS.list + ': ' + e.message, 'err') }
}

function renderGroups(containerId, groups, canManage) {
  const el = document.getElementById(containerId)
  if (!groups.length) {
    el.innerHTML = '<p class="empty">No groups yet. Create one or join an open group.</p>'
    return
  }
  el.innerHTML = groups.map(g => {
    const shortId = g.group_id.split('/').slice(-2).join('/')
    return `<div class="group-card">
      <h3>${escapeHtml(shortId)}</h3>
      <div class="meta">policy: ${escapeHtml(g.join_policy)} · role: ${escapeHtml(g.my_role)} · ${g.member_count} members</div>
      <div class="actions">
        <button class="secondary" onclick="viewMembers('${escapeAttr(g.group_id)}', ${canManage})">Members</button>
        ${canManage ? `<button class="secondary" onclick="inviteMember('${escapeAttr(g.group_id)}')">Invite</button>` : ''}
        ${canManage ? `<button class="secondary" onclick="checkJoinRequests('${escapeAttr(g.group_id)}')">Join Requests</button>` : ''}
        ${canManage && g.join_policy !== 'invite_only' ? `<button class="secondary" onclick="togglePolicy('${escapeAttr(g.group_id)}')">Toggle Policy</button>` : ''}
        <button class="danger" onclick="leaveGroup('${escapeAttr(g.group_id)}')">Leave</button>
      </div>
      <div id="detail-${safeId(g.group_id)}" class="detail hidden"></div>
    </div>`
  }).join('')
}

// ── Create Group (via CR — user must approve in auth UI) ────────────────

async function createGroup() {
  const name = groupName.value.trim()
  if (!name) return toast('Enter a community name', 'err')
  const policy = joinPolicy.value
  const roles = ROLE_PRESETS[rolePreset.value]

  const t = w.readToken()
  const cr = {
    kind: 'group',
    app_origin: window.location.origin,
    action: 'create_group',
    name,
    join_policy: policy,
    roles,
    members: [{ member_key: t.username, role: 'owner' }],
  }

  // Use the SDK's unified contractRequest (handles popup, handshake, timeout)
  console.log('[demo] createGroup — calling contractRequest with:', JSON.stringify(cr))
  w.contractRequest([cr], AUTH_ORIGIN, (resp) => {
    console.log('[demo] createGroup contractRequest callback — status:', resp.status, 'errors:', resp.errors)
    if (resp.status === 'approved') {
      toast('Group created!', 'ok')
      groupName.value = ''
      loadMyGroups()
      loadManageGroups()
    } else if (resp.status === 'denied') {
      toast('Group creation denied', 'err')
    } else {
      toast('Group creation failed: ' + (resp.errors?.[0] || 'unknown error'), 'err')
    }
  })
}

// ── Join Group (open = instant, request = pending, invite_only = must be invited) ──

async function joinGroup() {
  const groupId = joinGroupId.value.trim()
  if (!groupId) return toast('Enter a group ID', 'err')
  console.log('[demo] joinGroup — joining', groupId)
  try {
    const res = await v3Post('groups/join', { group_id: groupId })
    if (res.status === 'pending') {
      toast('Join requested — waiting for the owner to approve', 'ok')
    } else {
      toast('Joined!', 'ok')
    }
    joinGroupId.value = ''
    loadMyGroups()
    loadManageGroups()
  } catch (e) { toast(ERROR_MSGS.join + ': ' + e.message, 'err') }
}

// ── Members ──────────────────────────────────────────────────────────

async function viewMembers(groupId, canManage = false) {
  const detailId = 'detail-' + safeId(groupId)
  const detail = document.getElementById(detailId)
  detail.classList.remove('hidden')
  detail.innerHTML = '<p style="color:var(--muted);font-size:0.75rem;">loading members…</p>'
  try {
    const members = await v3Post('groups/members/list', { group_id: groupId })
    detail.innerHTML = members.map(m =>
      `<span class="member">${escapeHtml(m.member_key)} <span class="role">${escapeHtml(m.role)}</span>` +
      (canManage ? ` <button class="danger" style="padding:0 5px;font-size:0.65rem;line-height:1;" onclick="removeMember('${escapeAttr(groupId)}','${escapeAttr(m.member_key)}')" title="Remove ${escapeAttr(m.member_key)}">✕</button>` : '') +
      `</span>`
    ).join('') || '<span style="color:var(--muted);font-size:0.75rem;">no members</span>'
  } catch (e) { detail.innerHTML = `<span style="color:var(--danger);font-size:0.75rem;">${escapeHtml(e.message)}</span>` }
}

async function removeMember(groupId, memberKey) {
  if (!confirm(`Remove ${memberKey} from the group?`)) return
  console.log('[demo] removeMember —', memberKey, 'from', groupId)
  try {
    await v3Post('groups/members/remove', { group_id: groupId, member_key: memberKey })
    toast(`Removed ${memberKey}`, 'ok')
    viewMembers(groupId, true)
    loadMyGroups()
    loadManageGroups()
  } catch (e) { toast('Failed to remove: ' + e.message, 'err') }
}

async function inviteMember(groupId) {
  const key = prompt('Enter web10 username to invite:')
  if (!key) return
  const role = prompt('Role? (member, moderator):', 'member') || 'member'
  try {
    await v3Post('groups/invite', { group_id: groupId, member_key: key, role })
    toast(`Invited ${key} as ${role}`, 'ok')
  } catch (e) { toast(ERROR_MSGS.invite + ': ' + e.message, 'err') }
}

async function leaveGroup(groupId) {
  if (!confirm('Leave this group?')) return
  try {
    await v3Post('groups/leave', { group_id: groupId })
    toast('Left group', 'ok')
    loadMyGroups()
    loadManageGroups()
  } catch (e) { toast(ERROR_MSGS.leave + ': ' + e.message, 'err') }
}

async function togglePolicy(groupId) {
  const all = [...myGroupsCache, ...manageGroupsCache]
  const g = all.find(g => g.group_id === groupId)
  if (!g) return
  const policies = ['open', 'request', 'invite_only']
  const idx = (policies.indexOf(g.join_policy) + 1) % policies.length
  const newPolicy = policies[idx]

  // Use the SDK's unified contractRequest
  const cr = {
    kind: 'group',
    app_origin: window.location.origin,
    action: 'update_group',
    group_id: groupId,
    join_policy: newPolicy,
  }

  console.log('[demo] togglePolicy — calling contractRequest with:', JSON.stringify(cr))
  w.contractRequest([cr], AUTH_ORIGIN, (resp) => {
    console.log('[demo] togglePolicy contractRequest callback — status:', resp.status, 'errors:', resp.errors)
    if (resp.status === 'approved') {
      toast(`Policy → ${newPolicy}`, 'ok')
      loadMyGroups()
      loadManageGroups()
    } else if (resp.status === 'denied') {
      toast('Policy change denied', 'err')
    } else {
      toast('Policy change failed: ' + (resp.errors?.[0] || 'unknown error'), 'err')
    }
  })
}

// ── Join Requests ─────────────────────────────────────────────────────

async function checkJoinRequests(groupId) {
  const detailId = 'detail-' + safeId(groupId)
  const detail = document.getElementById(detailId)
  detail.classList.remove('hidden')
  detail.innerHTML = '<p style="color:var(--muted);font-size:0.75rem;">loading requests…</p>'
  try {
    const requests = await v3Post('groups/requests/join/list', { group_id: groupId })
    if (!requests.length) {
      detail.innerHTML = '<span style="color:var(--muted);font-size:0.75rem;">No pending requests</span>'
      return
    }
    detail.innerHTML = requests.map(r =>
      `<div class="join-req">
        <span class="user">${escapeHtml(r.requester_key)}</span>
        <span class="time">${new Date(r.requested_at).toLocaleString()}</span>
        <button class="ok" onclick="approveJoin('${escapeAttr(groupId)}','${escapeAttr(r.requester_key)}')">Approve</button>
        <button class="danger" onclick="denyJoin('${escapeAttr(groupId)}','${escapeAttr(r.requester_key)}')">Deny</button>
      </div>`
    ).join('')
  } catch (e) { detail.innerHTML = `<span style="color:var(--danger);font-size:0.75rem;">${escapeHtml(e.message)}</span>` }
}

async function approveJoin(groupId, key) {
  try {
    await v3Post('groups/requests/join/approve', { group_id: groupId, requester_key: key })
    toast(`${key} approved`, 'ok')
    checkJoinRequests(groupId)
  } catch (e) { toast(ERROR_MSGS.approve + ': ' + e.message, 'err') }
}

async function denyJoin(groupId, key) {
  try {
    await v3Post('groups/requests/join/deny', { group_id: groupId, requester_key: key })
    toast(`${key} denied`, 'ok')
    checkJoinRequests(groupId)
  } catch (e) { toast(ERROR_MSGS.deny + ': ' + e.message, 'err') }
}

// ── Board (Posts) ─────────────────────────────────────────────────────

function populateBoardSelects() {
  const all = [...myGroupsCache]
  const opts = all.map(g => {
    const short = g.group_id.split('/').slice(-2).join('/')
    return `<option value="${escapeAttr(g.group_id)}">${escapeHtml(short)}</option>`
  }).join('')
  postGroup.innerHTML = '<option value="">— pick a group —</option>' + opts
  filterGroup.innerHTML = '<option value="">All groups</option>' + opts
}

async function loadPosts() {
  try {
    const filterId = filterGroup.value
    const groups = filterId ? [filterId] : myGroupsCache.map(g => g.group_id)
    if (!groups.length) {
      posts.innerHTML = '<p class="empty">Join some groups first to see the community board.</p>'
      return
    }
    const docs = await v3Post('read', { service: SERVICE, groups })
    if (!docs.length) {
      posts.innerHTML = '<p class="empty">No posts yet — write one above!</p>'
      return
    }
    posts.innerHTML = docs
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(d => {
        const gLabels = (d.groups || []).map(g => g.split('/').slice(-2).join('/')).join(', ')
        return `<div class="post">
          <div class="post-meta">
            <span class="post-author">@${escapeHtml(d.author_key)}</span>
            <span class="post-date">${new Date(d.created_at).toLocaleString()}</span>
          </div>
          <div class="post-text">${escapeHtml(d.body.text || JSON.stringify(d.body))}</div>
          <div class="post-groups">${escapeHtml(gLabels)}</div>
        </div>`
      }).join('')
  } catch (e) { toast(ERROR_MSGS.read + ': ' + e.message, 'err') }
}

async function createPost() {
  const text = postText.value.trim()
  const groupId = postGroup.value
  if (!text) return toast('Write something', 'err')
  if (!groupId) return toast('Pick a group', 'err')
  try {
    await v3Post('create', {
      service: SERVICE,
      body: { text, date: new Date().toISOString() },
      groups: [groupId],
    })
    toast('Posted!', 'ok')
    postText.value = ''
    loadPosts()
  } catch (e) { toast(ERROR_MSGS.post + ': ' + e.message, 'err') }
}

// ── Helpers ───────────────────────────────────────────────────────────

function safeId(s) { return s.replace(/\//g, '--').replace(/\./g, '_') }
function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function escapeAttr(s) { return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;') }