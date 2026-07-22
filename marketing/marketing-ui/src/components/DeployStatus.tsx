import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'

interface DeployInfo {
  version?: string
  commit?: string
  commitTitle?: string
  deployedAt?: string
}

const known = (v?: string) => (v && v !== 'unknown' ? v : null)

// Fixed corner widget showing what build is live. Reads the status.json
// baked by build-status.sh at image build time; renders nothing when the
// feed is absent (local dev, tests) so there is never a dead control.
function DeployStatus() {
  const [info, setInfo] = useState<DeployInfo | null>(null)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/status.json', { signal: controller.signal })
      .then(res => {
        if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null
        return res.json()
      })
      .then(data => { if (data) setInfo(data) })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!info) return null

  const version = known(info.version)
  const commit = known(info.commit)
  const deployed = known(info.deployedAt)

  // If every field is unknown/missing, there is nothing useful to show.
  if (!version && !commit && !deployed) return null

  const label = version ? `v${version}` : commit ?? 'live'

  return (
    <div ref={rootRef} className="fixed bottom-4 right-4 z-40" data-testid="deploy-status">
      {open && (
        <div
          id="deploy-status-panel"
          className="absolute bottom-full right-0 mb-2 w-64 rounded-lg border border-border bg-surface p-4 shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
          data-testid="deploy-status-panel"
        >
          <p className="text-xs font-medium uppercase tracking-[0.04em] text-muted-foreground">
            Deployment
          </p>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            {version && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Version</dt>
                <dd className="font-mono text-[0.8125rem] text-foreground">{version}</dd>
              </div>
            )}
            {commit && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Commit</dt>
                <dd className="truncate font-mono text-[0.8125rem] text-foreground" title={known(info.commitTitle) ?? undefined}>
                  {commit}
                </dd>
              </div>
            )}
            {deployed && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Deployed</dt>
                <dd className="text-right text-[0.8125rem] text-foreground">
                  {new Date(deployed).toLocaleString(undefined, {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </dd>
              </div>
            )}
          </dl>
          <a
            href="/status/"
            className="mt-3 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-brand-300 transition-colors duration-150 ease-out hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Full status
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
          </a>
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-label="Deployment status"
        aria-expanded={open}
        aria-controls="deploy-status-panel"
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center gap-2 rounded-full border border-border bg-surface/95 px-3 py-1.5 backdrop-blur-sm transition-colors duration-150 ease-out before:absolute before:-inset-2 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        data-testid="deploy-status-toggle"
      >
        <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
        <span className="font-mono text-xs text-muted-foreground">{label}</span>
      </button>
    </div>
  )
}

export default DeployStatus
