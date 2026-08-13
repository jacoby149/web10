/* script.js */

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
const AUTH_ORIGIN = isLocal ? 'http://auth.localhost' : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const w = window.web10.createV3Client({ apiOrigin: isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app' })

const COLLECTION = 'mail'

authButton.onclick = () => {
  console.log('[demo] authButton clicked — opening popup + sending contract')
  window.web10.openAuthPortal(AUTH_ORIGIN)
  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      [COLLECTION]: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
    },
  }]
  console.log('[demo] calling contractRequest with:', JSON.stringify(contract))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    console.log('[demo] contractRequest callback — status:', resp.status, 'errors:', resp.errors)
    if (resp.status === 'approved') {
      message.innerHTML += `<br><span style="color:#22c55e;">app contract approved</span>`
      readMail()
    } else if (resp.status === 'denied') {
      message.innerHTML += `<br><span style="color:#ef4444;">app contract denied</span>`
    } else {
      message.innerHTML += `<br><span style="color:#ef4444;">contract request failed: ${resp.errors?.[0] || 'unknown'}</span>`
    }
  })
}
window.web10.authListen(() => initApp())

function initApp() {
  authButton.innerHTML = 'log out'
  authButton.onclick = () => { w.signOut(); window.location.reload() }
  const t = w.readToken()
  message.innerHTML = `hello ${t.provider}/${t.username},<br>`
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

if (w.isSignedIn()) initApp()