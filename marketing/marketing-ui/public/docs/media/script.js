/* media demo — script.js (v3, D42 lazy group, minio type in body) */

const LOG = (...args) => console.log('[media-demo]', ...args)
const LOG_ERR = (...args) => console.error('[media-demo]', ...args)

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
const AUTH_ORIGIN = isLocal ? 'http://auth.localhost' : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const API_ORIGIN = isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app'

const COLLECTION = 'media'
const TRANSCODE_POLL_MS = 2500
const TRANSCODE_POLL_MAX = 240 // ~10 minutes of polling

LOG('init — host:', host, 'isLocal:', isLocal, 'isDev:', isDev)
LOG('AUTH_ORIGIN:', AUTH_ORIGIN)
LOG('API_ORIGIN:', API_ORIGIN)

const w = window.web10.createV3Client({ apiOrigin: API_ORIGIN })

let ME = null // { username, provider } — set in initApp
let MEDIA_GROUP = null
const hlsInstances = new Map() // doc_id -> Hls instance (destroyed on re-render)
let pollCount = 0

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------

authButton.onclick = () => {
  LOG('authButton clicked — opening auth portal')
  window.web10.openAuthPortal(AUTH_ORIGIN)

  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      [COLLECTION]: ['readAll', 'create', 'deleteOwn'],
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
  LOG('token payload:', t ? `${t.provider}/${t.username}` : 'null')
  if (!t) {
    LOG_ERR('authListen fired but readToken() returned null — cookie not set?')
    message.innerHTML += `<br><span style="color:#ef4444;">auth failed: no token in cookie</span>`
    return
  }
  initApp()
})

// ---------------------------------------------------------------------------
// App init
// ---------------------------------------------------------------------------

function initApp() {
  LOG('initApp — setting up signed-in state')
  const t = w.readToken()
  if (!t) {
    LOG_ERR('initApp — readToken() is null, aborting')
    return
  }
  ME = { username: t.username, provider: t.provider }
  const groupName = `media-${t.username}`
  MEDIA_GROUP = `${t.provider}/groups/users/${t.username}/${groupName}`
  LOG('initApp — signed in as:', `${ME.provider}/${ME.username}`)
  LOG('MEDIA_GROUP set to:', MEDIA_GROUP)

  authButton.innerHTML = 'log out'
  authButton.onclick = () => {
    LOG('signOut clicked')
    w.signOut()
    window.location.reload()
  }
  message.innerHTML = `hello ${ME.provider}/${ME.username},<br>`
  editor.style.display = 'block'

  // D42: the group contract is LAZY — not sent on login. readMedia() is the
  // test: a successful read means the group is fine; a "not a member" 403
  // surfaces the "Set up your media group" button.
  LOG('D42 — group contract is lazy; reading media (the read is the test)')
  readMedia()
}

// ---------------------------------------------------------------------------
// Read + display
// ---------------------------------------------------------------------------

async function readMedia() {
  LOG('readMedia — called')
  if (!MEDIA_GROUP) {
    LOG('readMedia — MEDIA_GROUP is null, waiting for init')
    return
  }
  LOG('readMedia — querying collection:', COLLECTION, 'group:', MEDIA_GROUP)
  try {
    const docs = await w.read(COLLECTION, { groups: [MEDIA_GROUP] })
    LOG('readMedia — got', docs.length, 'docs')
    displayMedia(docs)
  } catch (e) {
    LOG_ERR('readMedia FAILED:', e.name, e.message, 'status:', e.status, 'details:', e.details)
    if (isAppContractError(e)) {
      showFixAccess('Access denied — your app contract may have been revoked.')
    } else if (isGroupError(e)) {
      showSetupGroup('Your media group is missing — set it up to post and see images.')
    } else {
      message.innerHTML = `failed to read media: ${e.message}`
    }
  }
}

// ---------------------------------------------------------------------------
// Upload → create a document with the minio type in the body
// ---------------------------------------------------------------------------

async function uploadImage() {
  const file = fileInput.files[0]
  LOG('uploadImage — called, file:', file ? `${file.name} (${file.type}, ${file.size} bytes)` : 'none')
  if (!file) {
    LOG('uploadImage — no file selected, aborting')
    message.innerHTML = 'pick an image first'
    return
  }
  if (!MEDIA_GROUP) {
    LOG_ERR('uploadImage — MEDIA_GROUP is null')
    message.innerHTML = 'media group not ready yet'
    return
  }

  uploadBtn.disabled = true
  try {
    // 1. Request a presigned POST form for the upload.
    LOG('uploadImage — requesting presigned upload URL for:', file.name)
    const presigned = await w.requestMediaUploadUrl({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    })
    LOG('uploadImage — presigned POST ok, object_key:', presigned.object_key)
    LOG('uploadImage — upload_url:', presigned.upload_url)

    // 2. Upload the file to MinIO via the presigned POST form.
    const formData = new FormData()
    for (const [key, value] of Object.entries(presigned.fields || {})) {
      LOG('uploadImage — form field:', key)
      formData.append(key, value)
    }
    formData.append('file', file, file.name)
    LOG('uploadImage — POSTing file to MinIO')
    const putRes = await fetch(presigned.upload_url, { method: 'POST', body: formData })
    LOG('uploadImage — MinIO response status:', putRes.status)
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '')
      LOG_ERR('uploadImage — MinIO upload FAILED:', putRes.status, text)
      throw new Error(`MinIO upload failed: ${putRes.status}`)
    }
    LOG('uploadImage — file uploaded to MinIO')

    // 3. Create the document. The body carries the minio type — the reference
    //    to the uploaded object. The API resolves it to a fresh presigned URL
    //    on read (the document never stores the URL).
    const body = {
      image: { type: 'minio', value: presigned.object_key },
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      date: new Date().toISOString(),
    }
    LOG('uploadImage — creating doc, body:', JSON.stringify(body))
    const result = await w.create(COLLECTION, body, { groups: [MEDIA_GROUP] })
    LOG('uploadImage — doc created, doc_id:', result.doc_id)

    // 4. Refresh — the read resolves the minio type to a presigned URL.
    fileInput.value = ''
    readMedia()
  } catch (e) {
    LOG_ERR('uploadImage FAILED:', e.name, e.message, 'status:', e.status, 'details:', e.details)
    if (isAppContractError(e)) {
      showFixAccess('Cannot upload — your app contract may have been revoked.')
    } else if (isGroupError(e)) {
      showSetupGroup('Cannot upload — your media group is missing.')
    } else {
      message.innerHTML = `failed to upload: ${e.message}`
    }
  } finally {
    uploadBtn.disabled = false
  }
}

// ---------------------------------------------------------------------------
// Video upload → HLS transcode → adaptive playback (D44)
// ---------------------------------------------------------------------------

async function uploadVideo() {
  const file = videoInput.files[0]
  LOG('uploadVideo — called, file:', file ? `${file.name} (${file.type}, ${file.size} bytes)` : 'none')
  if (!file) {
    LOG('uploadVideo — no file selected, aborting')
    message.innerHTML = 'pick a video first'
    return
  }
  if (!MEDIA_GROUP) {
    LOG_ERR('uploadVideo — MEDIA_GROUP is null')
    message.innerHTML = 'media group not ready yet'
    return
  }

  videoUploadBtn.disabled = true
  try {
    // 1. Request a presigned POST form for the upload.
    LOG('uploadVideo — requesting presigned upload URL for:', file.name)
    const presigned = await w.requestMediaUploadUrl({
      filename: file.name,
      mimeType: file.type || 'video/mp4',
      sizeBytes: file.size,
    })
    LOG('uploadVideo — presigned POST ok, object_key:', presigned.object_key)

    // 2. Upload the file to MinIO via the presigned POST form.
    const formData = new FormData()
    for (const [key, value] of Object.entries(presigned.fields || {})) {
      formData.append(key, value)
    }
    formData.append('file', file, file.name)
    LOG('uploadVideo — POSTing file to MinIO')
    const putRes = await fetch(presigned.upload_url, { method: 'POST', body: formData })
    LOG('uploadVideo — MinIO response status:', putRes.status)
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '')
      LOG_ERR('uploadVideo — MinIO upload FAILED:', putRes.status, text)
      throw new Error(`MinIO upload failed: ${putRes.status}`)
    }
    LOG('uploadVideo — file uploaded to MinIO')

    // 3. Create the document. body.video carries the minio type; the API
    //    resolves it on read, and the transcode worker reads it from here.
    const body = {
      video: { type: 'minio', value: presigned.object_key },
      filename: file.name,
      mime_type: file.type || 'video/mp4',
      size_bytes: file.size,
      date: new Date().toISOString(),
    }
    LOG('uploadVideo — creating doc, body:', JSON.stringify(body))
    const result = await w.create(COLLECTION, body, { groups: [MEDIA_GROUP] })
    LOG('uploadVideo — doc created, doc_id:', result.doc_id)

    // 4. Queue the HLS transcode (in-process ffmpeg worker on the node).
    const token = window.web10.readTokenCookie()
    LOG('uploadVideo — queueing transcode for doc_id:', result.doc_id)
    const tcRes = await fetch(`${API_ORIGIN}/v3/media/transcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, doc_id: result.doc_id }),
    })
    LOG('uploadVideo — transcode response status:', tcRes.status, 'body:', JSON.stringify(await tcRes.clone().json().catch(() => ({}))))
    if (!tcRes.ok) {
      throw new Error(`transcode request failed: ${tcRes.status}`)
    }

    // 5. Poll the document until transcoding settles (done | failed).
    videoInput.value = ''
    pollCount = 0
    readMedia()
    pollTranscode()
  } catch (e) {
    LOG_ERR('uploadVideo FAILED:', e.name, e.message, 'status:', e.status, 'details:', e.details)
    if (isAppContractError(e)) {
      showFixAccess('Cannot upload — your app contract may have been revoked.')
    } else if (isGroupError(e)) {
      showSetupGroup('Cannot upload — your media group is missing.')
    } else {
      message.innerHTML = `failed to upload video: ${e.message}`
    }
  } finally {
    videoUploadBtn.disabled = false
  }
}

// Re-read the group and re-render while any video doc is still processing.
// The document is the status surface (transcoding_settings.status) — the
// worker updates it, we just watch.
async function pollTranscode() {
  if (!MEDIA_GROUP) return
  pollCount += 1
  if (pollCount > TRANSCODE_POLL_MAX) {
    LOG('pollTranscode — giving up after', TRANSCODE_POLL_MAX, 'polls')
    return
  }
  try {
    const docs = await w.read(COLLECTION, { groups: [MEDIA_GROUP] })
    // "Processing" = has a video ref and hasn't settled. A brand-new doc has
    // no transcoding_settings yet (the worker marks it processing on pickup).
    const processing = docs.filter((d) => {
      if (!d.body?.video) return false
      const ts = d.body.transcoding_settings
      if (!ts) return true
      return ts.status !== 'done' && ts.status !== 'failed'
    })
    LOG('pollTranscode — poll', pollCount, '— processing docs:', processing.length)
    displayMedia(docs)
    if (processing.length > 0) {
      setTimeout(pollTranscode, TRANSCODE_POLL_MS)
    } else {
      LOG('pollTranscode — nothing processing, stopping')
    }
  } catch (e) {
    LOG_ERR('pollTranscode FAILED:', e.name, e.message, 'status:', e.status)
    // A failed poll (network blip, contract revoked) stops the loop; the
    // next manual readMedia() restarts it if needed.
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

async function deleteMedia(docId) {
  LOG('deleteMedia — called, docId:', docId)
  try {
    const result = await w.delete(docId)
    LOG('deleteMedia — success, result:', JSON.stringify(result))
    readMedia()
  } catch (e) {
    LOG_ERR('deleteMedia FAILED:', e.name, e.message, 'status:', e.status)
    message.innerHTML = `failed to delete: ${e.message}`
  }
}

// ---------------------------------------------------------------------------
// Distinguishable 403s (D42) — the API returns different details so the demo
// shows the right button. The SDK's Web10Error puts the API's detail in
// `e.details` (e.message is the generic "Request failed: 403 …").
// ---------------------------------------------------------------------------

function errorText(e) {
  return `${e.message || ''} ${e.details || ''}`
}
function isAppContractError(e) {
  return e.status === 403 && /no app contract/i.test(errorText(e))
}
function isGroupError(e) {
  return e.status === 403 && /not a member/i.test(errorText(e))
}

function showFixAccess(errorMsg) {
  LOG('showFixAccess — showing fix button, error:', errorMsg)
  fixAccessBtn.style.display = 'inline-block'
  message.innerHTML = `<span style="color:#ef4444;">${errorMsg}</span><br><span style="color:var(--muted);font-size:0.75rem;">Your app contract may have been revoked. Click "Fix access" to re-request.</span>`
}

function showSetupGroup(errorMsg) {
  LOG('showSetupGroup — showing setup button, error:', errorMsg)
  setupGroupBtn.style.display = 'inline-block'
  message.innerHTML = `<span style="color:#ef4444;">${errorMsg}</span><br><span style="color:var(--muted);font-size:0.75rem;">Your media group is missing. Click "Set up your media group" to create it.</span>`
}

fixAccessBtn.onclick = () => {
  LOG('fixAccessBtn clicked — opening auth portal to re-request contract')
  fixAccessBtn.style.display = 'none'
  window.web10.openAuthPortal(AUTH_ORIGIN, { handoff: 'none' })
  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      [COLLECTION]: ['readAll', 'create', 'deleteOwn'],
    },
  }]
  LOG('fixAccess — sending app contract:', JSON.stringify(contract, null, 2))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('fixAccess — contractRequest callback, status:', resp.status)
    if (resp.status === 'approved') {
      LOG('fixAccess — contract re-approved, retrying readMedia')
      message.innerHTML = `<span style="color:#22c55e;">Access restored.</span><br>`
      readMedia()
    } else {
      LOG_ERR('fixAccess — contract request failed:', resp.status, resp.errors)
      showFixAccess(`Fix access failed: ${resp.errors?.[0] || resp.status}`)
    }
  })
}

// D42: the group contract is LAZY — requested only when a read 403s with
// "not a member". This button (a user gesture) opens a fresh, self-contained
// popup for the group contract. handoff=none: the app already holds the token,
// so this popup is consent-only (it approves the group contract and closes).
setupGroupBtn.onclick = () => {
  LOG('setupGroupBtn clicked — opening auth portal to create the media group')
  setupGroupBtn.style.display = 'none'
  const t = w.readToken()
  if (!t) {
    LOG_ERR('setupGroupBtn — no token, cannot create group')
    showSetupGroup('Not signed in — log in first.')
    return
  }
  window.web10.openAuthPortal(AUTH_ORIGIN, { handoff: 'none' })
  const groupName = `media-${t.username}`
  const contract = [{
    kind: 'group',
    app_origin: window.location.origin,
    action: 'create_group',
    name: groupName,
    join_policy: 'invite_only',
    roles: [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
      { name: 'member', services: [COLLECTION], permissions: ['readAll', 'create', 'deleteOwn'] },
    ],
    members: [{ member_key: t.username, role: 'owner' }],
  }]
  LOG('setupGroup — sending group contract:', JSON.stringify(contract, null, 2))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('setupGroup — contractRequest callback, status:', resp.status)
    if (resp.errors) LOG('setupGroup — errors:', JSON.stringify(resp.errors))
    if (resp.status === 'approved') {
      LOG('setupGroup — group created, retrying readMedia')
      message.innerHTML = `<span style="color:#22c55e;">Media group ready.</span><br>`
      readMedia()
    } else {
      LOG_ERR('setupGroup — contract request failed:', resp.status, resp.errors)
      showSetupGroup(`Failed to set up your media group: ${resp.errors?.[0] || resp.status}`)
    }
  })
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function displayMedia(docs) {
  LOG('displayMedia — rendering', docs ? docs.length : 0, 'items')
  // Tear down hls.js instances for cards that are going away.
  for (const [docId, hls] of hlsInstances) {
    hls.destroy()
    hlsInstances.delete(docId)
  }
  if (!docs || docs.length === 0) {
    mediaview.innerHTML = '<p class="empty">No media yet — upload an image or a video above.</p>'
    return
  }
  mediaview.innerHTML = docs
    .slice()
    .sort((a, b) => new Date(b.body?.date) - new Date(a.body?.date))
    .map((doc) => {
      const b = doc.body || {}
      const date = b.date ? new Date(b.date).toLocaleString() : ''
      // Only the author can delete (the API scopes delete to the author).
      const mine = ME && doc.author_key === ME.username
      const delBtn = mine
        ? `<button class="danger" onclick="deleteMedia('${doc.doc_id}')">Delete</button>`
        : ''
      const actions = delBtn ? `<div class="media-actions">${delBtn}</div>` : ''
      if (b.video) {
        return videoCard(doc, b, date, actions)
      }
      const img = b.image || {}
      // The API resolved the minio type to a fresh presigned URL on read.
      const src = img.url || ''
      const key = img.value || ''
      return `<div class="media-card" data-testid="media-card">
        <img data-testid="media-image" src="${escapeAttr(src)}" alt="${escapeAttr(b.filename || 'image')}" />
        <div class="media-meta">
          <span class="media-key" data-testid="media-key">${escapeHtml(key)}</span>
          <span class="media-date">${escapeHtml(date)}</span>
        </div>
        ${actions}
      </div>`
    })
    .join('')
  // Attach players after the DOM is in place.
  for (const doc of docs) {
    if (doc.body?.video) attachPlayer(doc)
  }
}

function videoCard(doc, b, date, actions) {
  const ts = b.transcoding_settings || {}
  const key = b.video.value || ''
  const meta = `<div class="media-meta">
      <span class="media-key" data-testid="media-key">${escapeHtml(key)}</span>
      <span class="media-date">${escapeHtml(date)}</span>
    </div>`
  if (ts.status === 'done' && ts.enabled) {
    const levels = (ts.variants || []).map((v) => `${v.height}p`).join(' / ')
    return `<div class="media-card" data-testid="media-card">
      <video data-testid="video-player" controls playsinline></video>
      ${meta}
      <div class="transcode-status done" data-testid="transcode-status">HLS ready — adaptive: ${escapeHtml(levels)}</div>
      ${actions}
    </div>`
  }
  if (ts.status === 'failed') {
    return `<div class="media-card" data-testid="media-card">
      <div class="transcode-status failed" data-testid="transcode-status">transcode failed: ${escapeHtml(ts.error || 'unknown error')}</div>
      ${meta}
      ${actions}
    </div>`
  }
  // processing / queued / not-yet-marked
  return `<div class="media-card" data-testid="media-card">
    <div class="transcode-status" data-testid="transcode-status">transcoding to HLS… (${escapeHtml(ts.status || 'queued')})</div>
    ${meta}
    ${actions}
  </div>`
}

// hls.js for Chrome/Firefox, native HLS on Safari. The manifest_url comes
// from the read (the API minted the 10-minute sig when it resolved the doc).
function attachPlayer(doc) {
  const ts = doc.body.transcoding_settings || {}
  if (ts.status !== 'done' || !ts.enabled || !ts.manifest_url) return
  // Cards render newest-first; find the card whose key matches this doc.
  const cards = [...mediaview.querySelectorAll('.media-card')]
  const card = cards.find((c) => c.querySelector('.media-key')?.textContent === (doc.body.video.value || ''))
  const el = card ? card.querySelector('video[data-testid="video-player"]') : null
  if (!el) {
    LOG_ERR('attachPlayer — no video element found for doc', doc.doc_id)
    return
  }
  const manifestUrl = new URL(ts.manifest_url, API_ORIGIN).href
  LOG('attachPlayer — doc:', doc.doc_id, 'manifest:', manifestUrl)
  if (el.canPlayType('application/vnd.apple.mpegurl')) {
    LOG('attachPlayer — Safari native HLS')
    el.src = manifestUrl
    return
  }
  if (window.Hls && Hls.isSupported()) {
    const hls = new Hls()
    hlsInstances.set(doc.doc_id, hls)
    hls.loadSource(manifestUrl)
    hls.attachMedia(el)
    hls.on(Hls.Events.MANIFEST_PARSED, (e, data) => {
      LOG('hls — manifest parsed, levels:', data.levels.length, data.levels.map((l) => l.height + 'p').join('/'))
    })
    hls.on(Hls.Events.LEVEL_SWITCHED, (e, data) => {
      LOG('hls — switched to level', data.level)
    })
    hls.on(Hls.Events.ERROR, (e, data) => {
      LOG_ERR('hls error — type:', data.type, 'details:', data.details, 'fatal:', data.fatal)
    })
    return
  }
  LOG_ERR('attachPlayer — no HLS support in this browser')
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function escapeAttr(s) {
  return escapeHtml(s)
}

// ---------------------------------------------------------------------------
// Self-register in the app store (no auth required)
// ---------------------------------------------------------------------------
fetch(`${API_ORIGIN}/v3/apps/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    body: {
      url: `${window.location.origin}${window.location.pathname}`,
name: 'Media',
    description: 'Upload an image (presigned URL on read) or a video (transcoded to HLS — adaptive bitrate, signed segments) to your node.',
    },
  }),
}).catch(() => {})

// ---------------------------------------------------------------------------
// Restore session on page load
// ---------------------------------------------------------------------------
if (w.isSignedIn()) {
  LOG('page load — already signed in')
  initApp()
} else {
  LOG('page load — not signed in, showing login button')
}
