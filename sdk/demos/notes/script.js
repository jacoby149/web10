/* script.js */

import { createV3Client } from 'web10-npm'

const w = createV3Client({ apiOrigin: 'https://api.web10.app' })
const COLLECTION = 'notes'

function initApp() {
  authButton.innerHTML = 'log out'
  authButton.onclick = () => {
    w.signOut()
    window.location.reload()
  }
  const t = w.readToken()
  message.innerHTML = `hello ${t.provider}/${t.username},<br>`
  readNotes()
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
  try {
    const docs = await w.read(COLLECTION, { groups: ['me'] })
    displayNotes(docs)
  } catch (e) {
    message.innerHTML = `failed to read notes: ${e.message}`
  }
}

async function createNote(text) {
  try {
    await w.create(COLLECTION, { note: text, date: new Date().toISOString() })
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
