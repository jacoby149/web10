/* script.js */

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
const AUTH_ORIGIN = isLocal ? 'http://auth.localhost' : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const w = window.web10.createV3Client({ apiOrigin: isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app' })

const COLLECTION = 'notes'
let NOTES_GROUP = null

authButton.onclick = () => window.web10.openAuthPortal(AUTH_ORIGIN)
window.web10.authListen(() => initApp())

function initApp() {
  authButton.innerHTML = 'log out'
  authButton.onclick = () => { w.signOut(); window.location.reload() }
  const t = w.readToken()
  message.innerHTML = `hello ${t.provider}/${t.username},<br>`

  // Request app contract for notes collection
  w.contractRequest([{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      [COLLECTION]: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
    },
  }], AUTH_ORIGIN, (resp) => {
    if (resp.status === 'approved') {
      message.innerHTML += `<br><span style="color:#22c55e;">app contract approved</span>`
      ensureNotesGroup(t.username, t.provider)
    } else if (resp.status === 'denied') {
      message.innerHTML += `<br><span style="color:#ef4444;">app contract denied</span>`
    } else {
      message.innerHTML += `<br><span style="color:#ef4444;">contract request failed: ${resp.errors?.[0] || 'unknown'}</span>`
    }
  })
}

function ensureNotesGroup(username, provider) {
  const groupName = `notes-${username}`
  const groupId = `${provider}/groups/users/${username}/${groupName}`

  // Request group creation via contract request
  w.contractRequest([{
    kind: 'group',
    app_origin: window.location.origin,
    action: 'create_group',
    name: groupName,
    join_policy: 'invite_only',
    roles: [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
      { name: 'member', services: [COLLECTION], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
    ],
    members: [{ member_key: username, role: 'owner' }],
  }], AUTH_ORIGIN, (resp) => {
    if (resp.status === 'approved') {
      NOTES_GROUP = groupId
      message.innerHTML += `<br><span style="color:#22c55e;">notes group created</span>`
      readNotes()
    } else if (resp.status === 'denied') {
      message.innerHTML += `<br><span style="color:#ef4444;">group creation denied</span>`
    } else {
      // Group might already exist — try to load notes
      NOTES_GROUP = groupId
      readNotes()
    }
  })
}

async function readNotes() {
  if (!NOTES_GROUP) {
    message.innerHTML = 'setting up your notes group...'
    return
  }
  try {
    const docs = await w.read(COLLECTION, { groups: [NOTES_GROUP] })
    displayNotes(docs)
  } catch (e) {
    message.innerHTML = `failed to read notes: ${e.message}`
  }
}

async function createNote(text) {
  if (!NOTES_GROUP) return
  try {
    await w.create(COLLECTION, { note: text, date: new Date().toISOString() }, { groups: [NOTES_GROUP] })
    readNotes()
    curr.value = ''
  } catch (e) {
    message.innerHTML = `failed to create note: ${e.message}`
  }
}

async function updateNote(docId, text) {
  try {
    await w.update(docId, { note: text })
    readNotes()
  } catch (e) {
    message.innerHTML = `failed to update note: ${e.message}`
  }
}

async function deleteNote(docId) {
  try {
    await w.delete(docId)
    readNotes()
  } catch (e) {
    message.innerHTML = `failed to delete note: ${e.message}`
  }
}

function displayNotes(docs) {
  if (!docs.length) {
    noteview.innerHTML = '<p>no notes yet</p>'
    return
  }
  noteview.innerHTML = docs
    .sort((a, b) => new Date(b.body.date) - new Date(a.body.date))
    .map((doc) => {
      const id = doc.doc_id
      return `<div>
        <p style="font-family:monospace;">${doc.body.date}</p>
        <textarea id="${id}">${doc.body.note}</textarea>
        <button onclick="updateNote('${id}', document.getElementById('${id}').value)">Update</button>
        <button onclick="deleteNote('${id}')">Delete</button>
      </div>`
    })
    .join('<br>')
}

if (w.isSignedIn()) initApp()