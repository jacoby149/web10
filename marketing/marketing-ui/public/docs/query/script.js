/* script.js — query playground demo */

const LOG = (...args) => console.log('[query-demo]', ...args)
const LOG_ERR = (...args) => console.error('[query-demo]', ...args)

const host = window.location.hostname
const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app')
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
// non-80 port; the origins must carry the same port. Empty on :80.
const portSuffix = window.location.port ? `:${window.location.port}` : ''
const AUTH_ORIGIN = isLocal ? `http://auth.localhost${portSuffix}` : isDev ? 'https://auth.dev.web10.app' : 'https://auth.web10.app'
const API_ORIGIN = isLocal ? `http://api.localhost${portSuffix}` : isDev ? 'https://api.dev.web10.app' : 'https://api.web10.app'

LOG('init — host:', host, 'isLocal:', isLocal, 'isDev:', isDev)
LOG('AUTH_ORIGIN:', AUTH_ORIGIN)
LOG('API_ORIGIN:', API_ORIGIN)

const w = window.web10.createV3Client({ apiOrigin: API_ORIGIN })

// ---------------------------------------------------------------------------
// Examples — the "go crazy" showcase. Each is a real, runnable SELECT over the
// services the boundary CTE exposes (posts, comments, reactions). They are
// self-contained: they run against whatever the signed-in user can read, and
// degrade gracefully to an empty result when there's no matching data.
// ---------------------------------------------------------------------------

const EXAMPLES = [
  {
    label: 'Recent posts',
    sql: `SELECT doc_id, author_key, created_at
FROM posts
ORDER BY created_at DESC
LIMIT 20`,
  },
  {
    label: 'Trending (self-join)',
    sql: `SELECT p.doc_id, p.author_key, count() AS reactions
FROM posts p
JOIN reactions r ON r.ref_value = p.doc_id
GROUP BY p.doc_id, p.author_key
ORDER BY reactions DESC
LIMIT 20`,
  },
  {
    label: 'Reaction breakdown',
    sql: `SELECT JSONExtractString(body, 'reaction_type', 'value') AS type, count() AS n
FROM reactions
GROUP BY type
ORDER BY n DESC`,
  },
  {
    label: 'Hot posts (CTE)',
    sql: `WITH hot AS (
  SELECT ref_value, count() AS n
  FROM reactions
  GROUP BY ref_value
  HAVING n > 1
)
SELECT p.doc_id, p.author_key, h.n AS reactions
FROM posts p
JOIN hot h ON h.ref_value = p.doc_id
ORDER BY h.n DESC
LIMIT 20`,
  },
  {
    label: 'Comments by author',
    sql: `SELECT author_key, count() AS comments
FROM comments
GROUP BY author_key
ORDER BY comments DESC
LIMIT 20`,
  },
]

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------

authButton.onclick = () => {
  LOG('authButton clicked — opening auth portal')
  window.web10.openAuthPortal(AUTH_ORIGIN)

  // The query is read-only; the app contract grants read on the services the
  // playground can touch. (The query is also anon-capable — a missing token
  // reads the public board — but signing in scopes it to the user's groups.)
  const contract = [{
    kind: 'app',
    app_origin: window.location.origin,
    permissions: {
      'posts': ['readAll'],
      'comments': ['readAll'],
      'reactions': ['readAll'],
    },
  }]
  LOG('sending app contract:', JSON.stringify(contract, null, 2))

  w.contractRequest(contract, AUTH_ORIGIN, (resp) => {
    LOG('contractRequest callback — status:', resp.status)
    if (resp.errors) LOG('contractRequest errors:', JSON.stringify(resp.errors))
    if (resp.status === 'approved') {
      LOG('app contract APPROVED')
      message.innerHTML += `<br><span style="color:var(--success);">app contract approved</span>`
    } else if (resp.status === 'denied') {
      LOG('app contract DENIED')
      message.innerHTML += `<br><span style="color:var(--danger);">app contract denied</span>`
    } else {
      LOG_ERR('contract request FAILED:', resp.errors?.[0] || 'unknown')
      message.innerHTML += `<br><span style="color:var(--danger);">contract request failed: ${resp.errors?.[0] || 'unknown'}</span>`
    }
  })
}

window.web10.authListen(() => {
  LOG('authListen fired — user is signed in')
  const t = w.readToken()
  LOG('token payload:', t ? JSON.stringify(t, null, 2) : 'null')
  if (!t) {
    LOG_ERR('authListen fired but readToken() returned null — cookie not set?')
    message.innerHTML += `<br><span style="color:var(--danger);">auth failed: no token in cookie</span>`
    return
  }
  LOG('proceeding to initApp')
  initApp()
})

// ---------------------------------------------------------------------------
// App init
// ---------------------------------------------------------------------------

function initApp() {
  LOG('initApp — setting up signed-in state')
  authButton.innerHTML = 'log out'
  authButton.onclick = () => {
    LOG('signOut clicked')
    w.signOut()
    window.location.reload()
  }
  const t = w.readToken()
  LOG('initApp — token:', t ? `${t.provider}/${t.username}` : 'null')
  message.innerHTML = `signed in as ${t.provider}/${t.username}`
  playground.style.display = 'block'
  renderExamples()
  // Load the first example so the box is never empty on first run.
  loadExample(0)
}

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

function renderExamples() {
  LOG('renderExamples —', EXAMPLES.length, 'examples')
  examples.innerHTML = EXAMPLES.map((ex, i) =>
    `<button class="chip" type="button" data-testid="example-chip" data-index="${i}">${ex.label}</button>`,
  ).join('')
  Array.from(examples.children).forEach((chip) => {
    chip.onclick = () => loadExample(Number(chip.dataset.index))
  })
}

function loadExample(index) {
  const ex = EXAMPLES[index]
  if (!ex) return
  LOG('loadExample —', ex.label)
  sql.value = ex.sql
  Array.from(examples.children).forEach((chip, i) => {
    chip.classList.toggle('active', i === index)
  })
  // Enable Run now that there's a query to run.
  runBtn.disabled = false
}

// ---------------------------------------------------------------------------
// Run a query
// ---------------------------------------------------------------------------

sql.addEventListener('input', () => {
  runBtn.disabled = sql.value.trim() === ''
})

runBtn.onclick = () => runQuery()

// Cmd/Ctrl+Enter runs the query (an editor convention).
sql.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    runQuery()
  }
})

async function runQuery() {
  const sqlText = sql.value.trim()
  LOG('runQuery — sql length:', sqlText.length)
  if (!sqlText) return

  runBtn.disabled = true
  showLoading()
  const started = performance.now()
  try {
    LOG('runQuery — calling w.query()')
    const { rows, count } = await w.query(sqlText)
    LOG('runQuery — got', count, 'rows in', Math.round(performance.now() - started), 'ms')
    showResult(rows, count, Math.round(performance.now() - started))
  } catch (e) {
    LOG_ERR('runQuery FAILED:', e.name, e.message, 'status:', e.status, 'details:', e.details)
    showError(e)
  } finally {
    runBtn.disabled = false
  }
}

// ---------------------------------------------------------------------------
// Result rendering
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cellValue(v) {
  if (v === null || v === undefined) return '—'
  // Arrays (e.g. the tags column) render as a compact list.
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function showLoading() {
  LOG('showLoading')
  result.innerHTML =
    '<div class="loading" data-testid="result-loading">' +
    '<div class="bar"></div><div class="bar"></div><div class="bar"></div>' +
    '</div>'
}

function showError(e) {
  LOG('showError —', e.message)
  const detail = e.details ? `<div class="detail">${escapeHtml(e.details)}</div>` : ''
  result.innerHTML =
    `<div class="error" data-testid="result-error">` +
    `<div>Query failed${e.status ? ` (${e.status})` : ''}.</div>${detail}` +
    '</div>'
}

function showResult(rows, count, ms) {
  LOG('showResult —', count, 'rows,', ms, 'ms')
  if (!rows.length) {
    result.innerHTML =
      '<div class="empty" data-testid="result-empty">0 rows — no matching data in your groups.</div>'
    return
  }
  const columns = Object.keys(rows[0])
  const head = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const v = row[c]
          const isNum = typeof v === 'number'
          return `<td class="${isNum ? 'num' : ''}" title="${escapeHtml(cellValue(v))}">${escapeHtml(cellValue(v))}</td>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')
  result.innerHTML =
    `<div class="result-head"><span class="result-meta" data-testid="result-meta">${count} row${count === 1 ? '' : 's'} · ${ms}ms</span></div>` +
    `<div class="table-scroll" data-testid="result-table"><table>` +
    `<thead><tr>${head}</tr></thead>` +
    `<tbody>${body}</tbody>` +
    '</table></div>'
}

// ---------------------------------------------------------------------------
// Restore session on page load
// ---------------------------------------------------------------------------

if (w.isSignedIn()) {
  LOG('page load — already signed in')
  const t = w.readToken()
  LOG('restored token:', t ? `${t.provider}/${t.username}` : 'null')
  if (t) {
    initApp()
  } else {
    LOG_ERR('isSignedIn() true but readToken() is null — stale cookie?')
    w.signOut()
  }
} else {
  LOG('page load — not signed in, showing login button')
}
