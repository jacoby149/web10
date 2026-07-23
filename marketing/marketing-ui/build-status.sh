#!/bin/sh
# Generates status.json and status.html from git + CHANGELOG at build time.
# Runs inside the Docker build (marketing-ui container).
# Outputs to /app/dist/status/ so nginx serves them from /status/

set -e

OUTDIR="/app/dist/status"
mkdir -p "$OUTDIR"

# Git info (baked from VITE_GIT_COMMIT env, or read from git if available)
if [ -n "$VITE_GIT_COMMIT" ]; then
  COMMIT="$VITE_GIT_COMMIT"
else
  COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
fi

COMMIT_FULL=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
COMMIT_DATE=$(git log -1 --format='%ai' "$COMMIT_FULL" 2>/dev/null || echo "unknown")

# Version from CHANGELOG.md — passed as STATUS_VERSION build ARG
# (compose reads CHANGELOG.md and forwards it)
VERSION="${STATUS_VERSION:-unknown}"

# Build timestamp
BUILT_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")

# Health check URLs — passed as env vars or baked from VITE_API_URL
API_HEALTH="${VITE_API_URL:+$VITE_API_URL/docs}"
AUTH_HEALTH="${VITE_AUTH_URL:-}"
SOCIAL_HEALTH="${VITE_SOCIAL_URL:-}"
MARKETING_HEALTH="${VITE_MARKETING_URL:-}"

# Generate status.json
cat > "$OUTDIR/status.json" <<ENDJSON
{
  "version": "$VERSION",
  "commit": "$COMMIT",
  "commitDate": "$COMMIT_DATE",
  "deployedAt": "$BUILT_AT",
  "healthEndpoints": {
    "api": "$API_HEALTH",
    "auth": "$AUTH_HEALTH",
    "social": "$SOCIAL_HEALTH",
    "marketing": "$MARKETING_HEALTH"
  }
}
ENDJSON

# Generate status.html
cat > "$OUTDIR/index.html" <<'ENDHTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>web10 — Deployment Status</title>
  <style>
    /* Tokens — design.md §13 */
    :root {
      --color-background: #09090b;
      --color-foreground: #fafafa;
      --color-surface: #111113;
      --color-elevated: #18181b;
      --color-border: #27272a;
      --color-muted-foreground: #a1a1aa;
      --color-brand: #8b5cf6;
      --color-brand-300: #c4b5fd;
      --color-success: #22c55e;
      --color-warning: #f59e0b;
      --color-danger: #ef4444;
      --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
      --font-mono: 'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--color-background);
      color: var(--color-foreground);
      font-family: var(--font-sans);
      font-size: 1rem;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container {
      max-width: 480px;
      width: 100%;
    }
    .logo {
      text-align: center;
      margin-bottom: 2rem;
    }
    .logo h1 {
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--color-foreground);
    }
    .logo p {
      font-size: 0.8125rem;
      color: var(--color-muted-foreground);
      margin-top: 0.25rem;
    }
    .card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .card-title {
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-muted-foreground);
      margin-bottom: 0.75rem;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 0.5rem 0;
    }
    .row + .row {
      border-top: 1px solid var(--color-border);
    }
    .label {
      font-size: 0.875rem;
      color: var(--color-muted-foreground);
    }
    .value {
      font-size: 0.875rem;
      font-weight: 500;
      text-align: right;
      max-width: 60%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .value.mono {
      font-family: var(--font-mono);
      font-size: 0.8125rem;
    }
    .health-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }
    .health-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: var(--color-elevated);
      border-radius: 0.5rem;
      font-size: 0.8125rem;
      font-weight: 500;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-muted-foreground);
      flex-shrink: 0;
    }
    .dot.ok { background: var(--color-success); }
    .dot.fail { background: var(--color-danger); }
    .dot.checking { background: var(--color-warning); animation: pulse 1s infinite; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .footer {
      text-align: center;
      margin-top: 2rem;
      font-size: 0.75rem;
      color: var(--color-muted-foreground);
    }
    .footer a {
      color: var(--color-brand-300);
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>web10</h1>
      <p>Deployment Status</p>
    </div>

    <div class="card">
      <div class="card-title">Release</div>
      <div class="row">
        <span class="label">Version</span>
        <span class="value" id="version">—</span>
      </div>
      <div class="row">
        <span class="label">Commit</span>
        <span class="value mono" id="commit">—</span>
      </div>
      <div class="row">
        <span class="label">Deployed</span>
        <span class="value" id="deployed">—</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Services</div>
      <div class="health-grid">
        <div class="health-item">
          <span class="dot checking" id="dot-api"></span>
          API
        </div>
        <div class="health-item">
          <span class="dot checking" id="dot-auth"></span>
          Auth
        </div>
        <div class="health-item">
          <span class="dot checking" id="dot-social"></span>
          Social
        </div>
        <div class="health-item">
          <span class="dot checking" id="dot-marketing"></span>
          Marketing
        </div>
      </div>
    </div>

    <div class="footer">
      <a href="/status.json">status.json</a> · <a href="/">web10</a>
    </div>
  </div>

  <script>
    (async () => {
      let status;
      try {
        const res = await fetch('/status.json');
        status = await res.json();
      } catch {
        status = {};
      }

      const known = v => (v && v !== 'unknown' ? v : null);
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
      set('version', known(status.version));
      set('commit', known(status.commit));
      set('deployed', known(status.deployedAt) ? new Date(status.deployedAt).toLocaleString() : null);

      // Health URLs are baked into status.json at build time, but a
      // GitOps rebuild can omit the origin args and ship them empty —
      // which used to leave the dot stuck on the "checking" pulse
      // forever (Social + Marketing always yellow). Derive any missing
      // URL from the current hostname so the page is self-sufficient:
      // service vhosts are always <service>.<zone>, and "marketing" is
      // this very origin.
      const zone = location.hostname.replace(/^www\./, '');
      const derived = {
        api: 'https://api.' + zone + '/docs',
        auth: 'https://auth.' + zone + '/',
        social: 'https://social.' + zone + '/',
        marketing: location.origin + '/',
      };
      const endpoints = status.healthEndpoints || {};
      const checks = ['api', 'auth', 'social', 'marketing'].map(
        name => [name, known(endpoints[name]) || derived[name]]
      );

      // Bound every probe so a hanging host resolves to a real state
      // instead of pulsing yellow indefinitely.
      const probe = (url, opts) => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        return fetch(url, Object.assign({ signal: ctl.signal }, opts))
          .finally(() => clearTimeout(t));
      };

      await Promise.all(checks.map(async ([name, url]) => {
        const dot = document.getElementById('dot-' + name);
        if (!dot) return;
        if (!url) { dot.className = 'dot'; return; }  // unknown → neutral grey, never a forever-pulse
        try {
          const res = await probe(url, { method: 'HEAD', mode: 'same-origin' });
          dot.className = res.ok ? 'dot ok' : 'dot fail';
        } catch {
          // Cross-origin (services live on sibling vhosts): a no-cors
          // probe returns an opaque response we can only read as "up".
          try {
            const res = await probe(url, { mode: 'no-cors' });
            dot.className = (res.type === 'opaque' || res.ok) ? 'dot ok' : 'dot fail';
          } catch {
            dot.className = 'dot fail';
          }
        }
      }));
    })();
  </script>
</body>
</html>
ENDHTML

echo "status.json + status.html generated in $OUTDIR"