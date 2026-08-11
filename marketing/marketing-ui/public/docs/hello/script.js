/* hello demo — script.js (v3) */

const AUTH_ORIGIN = "https://auth.web10.app"
const w = window.web10.createV3Client({ apiOrigin: 'https://api.web10.app' })

// v3 API helpers — all v3 endpoints are POST with { token, ...params }
const API_ORIGIN = "https://api.web10.app"

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

authButton.onclick = () => window.web10.openAuthPortal(AUTH_ORIGIN)

function initApp() {
  authButton.innerHTML = "Log out"
  authButton.onclick = () => {
    w.signOut()
    window.location.reload()
  }
  const t = w.readToken()
  message.innerHTML = `Hello <strong>${t["provider"]}/${t["username"]}</strong> — you just authenticated with a web10 node.`

  // v3: load user groups to show group membership
  v3Post('groups/list').then(groups => {
    if (groups && groups.length > 0) {
      const groupList = groups.map(g =>
        `<code>${g.group_id}</code> <span style="color:var(--muted)">(${g.my_role}, ${g.member_count} members)</span>`
      ).join('<br/>')
      message.innerHTML += `
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);text-align:left">
          <strong>Groups (${groups.length}):</strong><br/>${groupList}
        </div>`
    }
  }).catch(() => {
    // v3 groups might not be available yet — degrade gracefully
  })
}

if (w.isSignedIn()) initApp()
else window.web10.authListen(() => initApp())
