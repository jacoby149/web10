/* script.js */

import { createV3Client } from 'web10-npm'

const w = createV3Client({ apiOrigin: 'https://api.web10.app' })
const COLLECTION = 'mail'

function initApp() {
  authButton.innerHTML = 'log out'
  authButton.onclick = () => {
    w.signOut()
    window.location.reload()
  }
  const t = w.readToken()
  message.innerHTML = `hello ${t.provider}/${t.username},<br>`
  readMail()
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

async function readMail() {
  try {
    const docs = await w.read(COLLECTION, { groups: ['me'] })
    displayMail(docs)
  } catch (e) {
    message.innerHTML = `failed to read mail: ${e.message}`
  }
}

async function createMail(text, toUser) {
  try {
    const t = w.readToken()
    await w.create(COLLECTION, {
      mail: text,
      date: new Date().toISOString(),
      sender: t.username,
      to: toUser,
    })
    readMail()
    curr.value = ''
    message.innerHTML = 'sent message'
  } catch (e) {
    message.innerHTML = `failed to send mail: ${e.message}`
  }
}

async function deleteMail(docId) {
  try {
    await w.delete(docId)
    readMail()
  } catch (e) {
    message.innerHTML = `failed to delete mail: ${e.message}`
  }
}

function displayMail(docs) {
  if (!docs.length) {
    mailview.innerHTML = '<p>no mail yet</p>'
    return
  }
  mailview.innerHTML = docs
    .sort((a, b) => new Date(b.body.date) - new Date(a.body.date))
    .map((doc) => {
      const id = doc.doc_id
      return `<div style="margin-top:40px;margin-left:10px">
        <p style="font-family:monospace;">${doc.body.date}</p>
        <p style="font-family:monospace;">${doc.body.sender} → ${doc.body.to}</p>
        <i id="${id}">${doc.body.mail}</i>
        <button onclick="deleteMail('${id}')">Delete</button>
      </div>`
    })
    .join('<br>')
}
