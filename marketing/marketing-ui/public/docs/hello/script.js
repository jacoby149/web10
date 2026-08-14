/* script.js */

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
const AUTH_ORIGIN = isLocal ? 'http://auth.localhost' : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const w = window.web10.createV3Client({ apiOrigin: isLocal ? 'http://api.localhost' : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app' })

authButton.onclick = () => {
  console.log('[demo] authButton clicked — opening popup + sending contract')
  window.web10.openAuthPortal(AUTH_ORIGIN)
  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      'profile': ['readAll'],
    },
  }]
  console.log('[demo] calling contractRequest with:', JSON.stringify(contract))
  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    console.log('[demo] contractRequest callback — status:', resp.status, 'errors:', resp.errors)
    if (resp.status === 'approved') {
      message.innerHTML += `<br><span style="color:#22c55e;">app contract approved</span>`
    } else if (resp.status === 'denied') {
      message.innerHTML += `<br><span style="color:#ef4444;">app contract denied</span>`
    } else {
      message.innerHTML += `<br><span style="color:#ef4444;">contract request failed: ${resp.errors?.[0] || 'unknown'}</span>`
    }
  })
}
window.web10.authListen(() => {
  initApp()
  window.web10.closeAuthPopup()
})

function initApp() {
  authButton.innerHTML = 'log out'
  authButton.onclick = () => { w.signOut(); window.location.reload() }
  const t = w.readToken()
  message.innerHTML = `hello ${t.provider}/${t.username},<br>`
  loadGroups()
}

async function loadGroups() {
  try {
    const groups = await w.getMyGroups()
    console.log('[demo] groups loaded:', groups.length, groups)
    if (!groups.length) {
      message.innerHTML += '<br><span style="color:var(--muted);">no groups yet — try the groups demo to create one</span>'
      return
    }
    const list = groups.map(g => {
      const short = g.group_id.split('/').slice(-2).join('/')
      return `<span class="group-chip">${short}</span>`
    }).join('')
    message.innerHTML += `<br><span style="color:#a1a1aa;font-size:0.75rem;">your groups:</span><br><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${list}</div>`
  } catch (e) {
    console.error('[demo] loadGroups failed:', e)
    message.innerHTML += `<br><span style="color:#ef4444;">failed to load groups: ${e.message}</span>`
  }
}

if (w.isSignedIn()) initApp()