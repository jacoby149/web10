/* script.js */

import { createV3Client } from 'web10-npm'

const w = createV3Client({ apiOrigin: 'https://api.web10.app' })
const COLLECTION = 'notes'

let NOTES_GROUP = null // personal group for notes, set after auth

async function ensureNotesGroup(username, provider) {
  const groupName = `notes-${username}`
  const groupId = `${provider}/groups/users/${username}/${groupName}`

  try {
    // Check if we're already a member
    const groups = await w.getMyGroups()
    const existing = groups.find(g => g.group_id === groupId)
    if (existing) {
      NOTES_GROUP = groupId
      return groupId
    }
  } catch {
    // groups/list might fail — try to create
  }

  // Create the personal notes group (invite_only, user as owner)
  try {
    await w.createGroup(groupName, 'invite_only', [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
      { name: 'member', services: [COLLECTION], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
    ], [
      { member_key: username, role: 'owner' },
    ])
    NOTES_GROUP = groupId
    return groupId
  } catch (err) {
    console.warn('Failed to create notes group:', err)
    return null
  }
}

function initApp() {
  authButton.innerHTML = 'log out'
  authButton.onclick = () => {
    w.signOut()
    window.location.reload()
  }
  const t = w.readToken()
  message.innerHTML = `hello ${t.provider}/${t.username},<br>`

  // v3: ensure the personal notes group exists, then load notes
  ensureNotesGroup(t.username, t.provider).then(() => readNotes())
}

if (w.isSignedIn()) initApp()
else {
  authButton.onclick = async () => {
    try {
      await w.login(usernameInput.value, passwordInput.value)
      window.location.reload()
    } catch (e) {
      message.innerHTML = `login failed: ${e.message}`
    }
  }
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
