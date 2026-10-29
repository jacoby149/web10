/* Shared boundary handling for the two independent, static SDK demos. */
window.interop = (() => {
  const host = location.hostname
  const local = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
  const dev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
  const port = location.port ? `:${location.port}` : ''
  // Provider deployment configuration, matching the existing public demos.
  const provider = {
    apiOrigin: local ? `http://api.localhost${port}` : dev ? 'https://api.dev.web10.app' : 'https://api.web10.app',
    authOrigin: local ? `http://auth.localhost${port}` : dev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app',
    socialOrigin: local ? `http://social.localhost${port}` : dev ? 'https://social.dev.web10.app' : 'https://social.web10.app',
  }
  const el = (tag, text, testId) => {
    const node = document.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (testId) node.dataset.testid = testId
    return node
  }
  function object(value) {
    try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {} } catch { return {} }
  }
  function safeURL(value) {
    if (typeof value !== 'string') return null
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null }
  }
  function identity(row) {
    const profile = object(row.profile_body)
    const author = String(row.author_key || 'Unknown author')
    const name = typeof profile.display_name === 'string' && profile.display_name.trim() ? profile.display_name : author
    const wrap = el('div'); wrap.className = 'identity'
    const fallback = el('span', name.slice(0, 1).toUpperCase()); fallback.className = 'avatar'; fallback.setAttribute('aria-hidden', 'true')
    wrap.append(fallback)
    const avatar = safeURL(row.avatar_url)
    if (avatar) {
      const img = el('img', undefined, 'identity-avatar'); img.className = 'avatar'; img.alt = ''; img.referrerPolicy = 'no-referrer'
      img.onload = () => fallback.replaceWith(img)
      img.src = avatar
    }
    const text = el('div'); text.append(el('strong', name, 'identity-name'), el('br'))
    const wall = new URL(`/u/${encodeURIComponent(author)}`, provider.socialOrigin)
    const link = el('a', 'View social wall', 'identity-wall'); link.href = safeURL(wall.href); link.target = '_blank'; link.rel = 'noopener noreferrer'
    text.append(link); wrap.append(text); return wrap
  }
  const prepare = { face: { bodyField: 'profile_body', mediaField: 'avatar_ref', authorColumn: 'author_key', urlField: 'avatar_url' } }
  const profiles = `SELECT author_key, body FROM profile
    QUALIFY row_number() OVER (PARTITION BY author_key ORDER BY updated_at DESC, created_at DESC, doc_id DESC) = 1`

  function session(service, onReady, onReset) {
    const w = window.web10.createV3Client({ apiOrigin: provider.apiOrigin })
    const status = document.getElementById('status')
    const auth = document.getElementById('authButton')
    const signout = document.getElementById('signOut')
    let epoch = 0, approved = false, pending = false, active = '', readyEpoch = -1
    const principal = () => { const t = w.readToken(); return t?.username && t?.provider ? `${t.provider}/${t.username}` : '' }
    function state(kind, message) {
      status.dataset.state = kind; status.textContent = message
      console.info(`[${service}-demo] state`, kind)
    }
    function reset() {
      epoch++; approved = false; pending = false; readyEpoch = -1
      active = principal(); onReset()
      auth.disabled = false; auth.textContent = active ? 'Authorize access' : 'Log in'; signout.hidden = !active
    }
    function ticket() {
      const id = epoch, who = principal()
      return () => {
        if (id !== epoch) return false
        if (who !== principal()) { reset(); state('login', 'Account changed. Authorize access to continue.'); return false }
        return true
      }
    }
    function failure(error) {
      if (error?.status === 401 || error?.status === 403) {
        reset(); state('error', 'Access is unavailable or was revoked. Authorize access to try again.')
      } else state('error', 'The node request failed. Try again; no successful save is assumed.')
      console.warn(`[${service}-demo] request failed`, { status: Number(error?.status) || 0 })
    }
    async function enter() {
      if (!approved || !principal() || readyEpoch === epoch) return
      active = principal(); readyEpoch = epoch; pending = false
      auth.disabled = false; auth.textContent = 'Authorize access'; signout.hidden = false
      const valid = ticket(); state('loading', 'Loading your app group and readable documents...')
      try {
        const token = w.readToken()
        const group = await w.createGroup(`demo-${service.replaceAll('_', '-')}`, 'invite_only', [
          { name: 'owner', permissions: { [service]: ['create', 'readAll'] } },
          { name: 'reader', permissions: { [service]: ['readAll'] } },
        ], [{ member_key: token.username, role: 'owner' }, { member_key: 'anyone', role: 'reader' }], { discoverable: true })
        if (!valid()) return
        await onReady({ w, group: group.group_id, valid, ticket, state, failure })
      } catch (error) { if (valid()) failure(error) }
    }
    auth.onclick = () => {
      reset(); pending = true; const attempt = epoch
      auth.disabled = true; state('loading', 'Waiting for authentication and consent...')
      try {
        window.web10.openAuthPortal(provider.authOrigin)
        w.contractRequest([{ kind: 'app', app_origin: location.origin, permissions: {
          [service]: ['create', 'readAll'], profile: ['readAll'],
        } }], provider.authOrigin, response => {
          if (attempt !== epoch) return
          if (response.status === 'approved') { approved = true; enter() }
          else {
            pending = false; auth.disabled = false
            state(response.status === 'denied' ? 'denied' : 'failed', response.status === 'denied' ? 'Consent denied. No app data was loaded.' : 'Consent failed or was cancelled. Try again.')
          }
        })
      } catch { pending = false; auth.disabled = false; state('failed', 'Could not open consent. Allow popups and try again.') }
    }
    window.web10.authListen(() => {
      // Authentication may arrive before approval; it must not trigger reads.
      if (pending || approved) enter()
      else { reset(); state('login', 'Signed in. Authorize access to continue.') }
    })
    signout.onclick = () => { w.signOut(); reset(); state('login', 'Signed out. Log in to load shared data.') }
    function check() {
      if (active && active !== principal()) { reset(); state('login', 'Account changed. Authorize access to continue.') }
      // The SDK deduplicates same-user auth events. Poll only local state, not API.
      if (pending && approved) enter()
    }
    window.addEventListener('focus', check)
    setInterval(check, 500)
    reset()
    if (active) { approved = true; enter() }
    else state('login', 'Log in to load shared data. Your profile is read-only in this app.')
    return { w }
  }
  return { el, object, safeURL, identity, prepare, profiles, session }
})()
