import { useState, useCallback, useRef, useEffect } from 'react'
import { ArrowLeft, Camera, Users, Video, UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card } from '../components/ui/card'
import { trackFunnel } from '../lib/analytics'

const API_URL = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('api')) ||
  ((import.meta as any).env?.VITE_API_URL || 'https://api.web10.app')

const MARKETING_API = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('marketing_api')) ||
  ((import.meta as any).env?.VITE_MARKETING_API || 'http://marketing-api.localhost')

type Platform = 'instagram' | 'facebook' | 'youtube'

interface ImportProgress {
  phase: string
  message?: string
  total_files: number
  processed_files: number
  total_records: number
  written_records: number
  skipped_records: number
  current_service?: string
  errors: string[]
  services_summary: Record<string, { written: number; skipped: number }>
}

// lucide-react dropped brand/social marks (trademark upkeep) — generic
// icons stand in rather than shipping a redrawn Instagram/Facebook/YouTube
// glyph we have no right to.
const PLATFORMS: Array<{ key: Platform; label: string; icon: typeof Camera; color: string }> = [
  { key: 'instagram', label: 'Instagram', icon: Camera, color: '#E1306C' },
  { key: 'facebook', label: 'Facebook', icon: Users, color: '#1877F2' },
  { key: 'youtube', label: 'YouTube', icon: Video, color: '#FF0000' },
]

export function Exporter() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [showChecklist, setShowChecklist] = useState(false)
  const [checklistDone, setChecklistDone] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [nodeUrl, setNodeUrl] = useState(API_URL)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [username, setUsername] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<number | null>(null)

  // Track exporter_view once on mount (fix: was firing on every render)
  useEffect(() => {
    trackFunnel('exporter_view')
  }, [])

  // Check if user has a web10 token (from wapi if loaded)
  const handleSignIn = useCallback(() => {
    const token = prompt('Enter your web10 JWT token:')
    if (token) {
      setTokenInput(token)
      setIsSignedIn(true)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUsername(payload.username || 'user')
      } catch {
        setUsername('user')
      }
      trackFunnel('sign_in_click')
    }
  }, [])

  const selectPlatform = useCallback((platform: Platform) => {
    setSelectedPlatform(platform)
    setShowChecklist(true)
    setChecklistDone(false)
    setProgress(null)
    setJobId(null)
    trackFunnel('exporter_view', { platform })
  }, [])

  const startPolling = useCallback((jid: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`${MARKETING_API}/import/${jid}`)
        const data = await res.json()
        setProgress(data)
        if (data.phase === 'complete' || data.phase === 'error') {
          if (pollRef.current) clearInterval(pollRef.current)
          if (data.phase === 'complete') trackFunnel('export_complete')
        }
      } catch {
        // keep polling
      }
    }
    poll()
    pollRef.current = window.setInterval(poll, 2000)
  }, [])

  const handleFile = useCallback(async (file: File) => {
    if (!isSignedIn) {
      alert('Please sign in first with your web10 token.')
      return
    }

    setProgress({
      phase: 'pending',
      message: 'Creating import job...',
      total_files: 0,
      processed_files: 0,
      total_records: 0,
      written_records: 0,
      skipped_records: 0,
      errors: [],
      services_summary: {},
    })

    try {
      // Create job
      const createRes = await fetch(`${MARKETING_API}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: selectedPlatform || undefined,
          user_token: tokenInput,
          node_api_url: nodeUrl,
        }),
      })
      const jobData = await createRes.json()
      const jid = jobData.id
      setJobId(jid)
      trackFunnel('export_started')

      // Upload ZIP
      const formData = new FormData()
      formData.append('file', file)

      await fetch(`${MARKETING_API}/import/${jid}/upload`, {
        method: 'POST',
        body: formData,
      })

      setProgress({
        phase: 'parsing',
        message: 'ZIP uploaded, processing on server...',
        total_files: 0,
        processed_files: 0,
        total_records: 0,
        written_records: 0,
        skipped_records: 0,
        errors: [],
        services_summary: {},
      })

      startPolling(jid)
    } catch (err) {
      setProgress(prev => ({
        total_files: 0,
        processed_files: 0,
        total_records: 0,
        written_records: 0,
        skipped_records: 0,
        services_summary: {},
        ...prev,
        phase: 'error',
        message: `Upload failed: ${err}`,
        errors: [String(err)],
      }))
    }
  }, [isSignedIn, tokenInput, nodeUrl, selectedPlatform, startPolling])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const resetImporter = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    setProgress(null)
    setJobId(null)
    setShowChecklist(false)
    setChecklistDone(false)
    setSelectedPlatform(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const selected = PLATFORMS.find(p => p.key === selectedPlatform)

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pt-12 pb-24 text-foreground sm:px-6">
      <h1 className="font-display text-3xl font-bold tracking-[-0.02em]">Import Your Social Life</h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        Bring your posts, photos, comments, and contacts from any platform into your web10 node.
      </p>

      {!isSignedIn ? (
        <Card className="border-warning/40 bg-warning/10 p-5">
          <p className="text-sm">
            <strong className="font-medium text-foreground">Sign in required.</strong>{' '}
            <span className="text-muted-foreground">You need a web10 account to import data.</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild variant="brand">
              <a href="https://auth.web10.app">Sign In via web10</a>
            </Button>
            <Button variant="outline" onClick={handleSignIn}>
              Paste JWT Token
            </Button>
          </div>
        </Card>
      ) : (
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <p className="text-sm text-muted-foreground">
              Signed in as <strong className="font-medium text-foreground">{username}</strong>
            </p>
            <div className="min-w-[200px] flex-1">
              <Input
                type="text"
                placeholder="Node API URL"
                value={nodeUrl}
                onChange={e => setNodeUrl(e.target.value)}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setIsSignedIn(false); setTokenInput('') }}
            >
              Sign Out
            </Button>
          </div>

          {!selectedPlatform && (
            <div>
              <h2 className="mb-4 font-display text-lg font-medium">Choose a Platform</h2>
              <div className="flex flex-wrap gap-4">
                {PLATFORMS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => selectPlatform(p.key)}
                    className="flex min-w-[160px] flex-1 flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6 text-center transition-colors duration-150 ease-out hover:border-brand-muted hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* platform accent color: the source platform's own
                        identity color, not a web10 token — used only to
                        tell the three import choices apart at a glance */}
                    <p.icon className="h-8 w-8" style={{ color: p.color }} strokeWidth={1.5} />
                    <strong className="text-base font-medium">{p.label}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedPlatform && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="mb-4 -ml-2"
                onClick={() => {
                  setSelectedPlatform(null)
                  setShowChecklist(false)
                  setChecklistDone(false)
                }}
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                Back to platforms
              </Button>

              {showChecklist && (
                <TakeoutChecklist
                  platform={selectedPlatform}
                  onDone={() => setChecklistDone(true)}
                />
              )}

              {checklistDone && (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-16 text-center transition-colors duration-150 ease-out ${
                    dragOver ? 'border-brand bg-brand-muted/30' : 'border-border bg-surface hover:bg-elevated'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleInputChange}
                    className="hidden"
                  />
                  <UploadCloud className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                  <p className="text-lg">{dragOver ? 'Drop your ZIP here' : 'Drag your ZIP here'}</p>
                  <p className="text-sm text-muted-foreground">or click to browse files</p>
                </div>
              )}

              {progress && progress.phase !== 'idle' && progress.phase !== 'complete' && progress.phase !== 'error' && (
                <div className="mt-6">
                  <span className="rounded-full bg-brand-muted px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-brand-300">
                    {progress.phase}
                  </span>
                  <p className="mt-2 text-sm text-muted-foreground">{progress.message}</p>
                  {progress.total_records > 0 && (
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-elevated">
                      <div
                        className="h-full rounded-full bg-brand transition-[width] duration-150 ease-out"
                        style={{
                          width: `${Math.min(100, Math.round(((progress.written_records + progress.processed_files) / progress.total_records) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                  {progress.errors.length > 0 && (
                    <Card className="mt-3 border-warning/40 bg-warning/10 p-4 text-sm">
                      <strong className="font-medium">Warnings ({progress.errors.length}):</strong>
                      <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                        {progress.errors.slice(0, 5).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </div>
              )}

              {progress && progress.phase === 'complete' && (
                <div className="mt-6">
                  <Card className="flex items-start gap-3 border-success/40 bg-success/10 p-4">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" strokeWidth={1.75} />
                    <strong className="font-medium">
                      Import complete — {progress.written_records} records written
                      {progress.skipped_records > 0 && `, ${progress.skipped_records} skipped`}
                    </strong>
                  </Card>

                  {Object.keys(progress.services_summary).length > 0 && (
                    <table className="mt-3 w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-2 font-medium">Service</th>
                          <th className="py-2 font-medium">Written</th>
                          <th className="py-2 font-medium">Skipped</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(progress.services_summary).map(([service, stats]: [string, any]) => (
                          <tr key={service} className="border-b border-border">
                            <td className="py-2">{service}</td>
                            <td className="py-2 font-mono tabular-nums">{stats.written}</td>
                            <td className="py-2 font-mono tabular-nums">{stats.skipped}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {progress.errors.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-muted-foreground">
                        Show {progress.errors.length} errors
                      </summary>
                      <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                        {progress.errors.slice(0, 20).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button variant="brand" onClick={resetImporter}>
                      Import From Another Platform
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setProgress(null)
                        setChecklistDone(false)
                        setShowChecklist(true)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                    >
                      Import Another {selected ? selected.label : 'Platform'} Archive
                    </Button>
                  </div>
                </div>
              )}

              {progress && progress.phase === 'error' && (
                <div className="mt-6">
                  <Card className="flex items-start gap-3 border-danger/40 bg-danger-muted/50 p-4">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" strokeWidth={1.75} />
                    <div>
                      <strong className="font-medium">Import failed</strong>
                      {progress.message && <p className="mt-1 text-sm text-muted-foreground">{progress.message}</p>}
                    </div>
                  </Card>
                  {progress.errors.length > 0 && (
                    <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">
                      {progress.errors.slice(0, 10).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4">
                    <Button variant="brand" onClick={resetImporter}>
                      Try Again
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TakeoutChecklist({ platform, onDone }: { platform: Platform; onDone: () => void }) {
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const CHECKLISTS: Record<Platform, Array<{ title: string; description: string }>> = {
    instagram: [
      { title: 'Open Instagram', description: 'Go to instagram.com and log in to your account.' },
      { title: 'Go to Settings', description: 'Profile > Settings and privacy > Your information > Download your information.' },
      { title: 'Request Export', description: 'Click "Request Download". Choose "Complete copy".' },
      { title: 'Choose JSON Format', description: 'Select "JSON" format (required). Choose "Highest" quality.' },
      { title: 'Wait for Meta (1-3 days)', description: "You'll get a notification when ready." },
      { title: 'Download the ZIP', description: 'Download the ZIP file when Meta notifies you.' },
    ],
    facebook: [
      { title: 'Open Facebook', description: 'Go to facebook.com and log in.' },
      { title: 'Go to Settings', description: 'Settings & Privacy > Settings > Your information > Download your information.' },
      { title: 'Create a File', description: 'Click "Create File". Select all time range, JSON format, highest quality.' },
      { title: 'Select Data Types', description: 'Select Posts, Photos, and Friends. Click "Next" and confirm.' },
      { title: 'Wait for Meta (1-3 days)', description: "You'll get a notification and email when ready." },
      { title: 'Download the ZIP', description: 'Click "Download" when ready.' },
    ],
    youtube: [
      { title: 'Open Google Takeout', description: 'Go to takeout.google.com and sign in.' },
      { title: 'Select YouTube Only', description: 'Deselect all, then check "YouTube and YouTube Music".' },
      { title: 'Choose Data Types', description: 'Select Videos, Comments, and Channels.' },
      { title: 'Choose Export Settings', description: 'Select JSON format if available. Choose file size.' },
      { title: 'Create Export', description: 'Choose "Export once" and click "Create export".' },
      { title: 'Download the ZIP', description: 'Google will email you when ready. Download from the link.' },
    ],
  }

  const steps = CHECKLISTS[platform]
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1)
  const allDone = checked.size === steps.length

  const toggleStep = (idx: number) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <Card className="mb-8 p-5">
      <h2 className="font-display text-lg font-medium">Getting Your {platformLabel} Data</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        {platform === 'youtube'
          ? 'Google requires you to request your data export through Google Takeout.'
          : `${platformLabel} requires you to request your data export through their app or website.`}
        {' '}Follow these steps, then come back here with the ZIP file.
      </p>

      <div className="flex flex-col gap-2">
        {steps.map((step, idx) => {
          const done = checked.has(idx)
          return (
            <button
              key={idx}
              type="button"
              onClick={() => toggleStep(idx)}
              className={`flex items-start gap-4 rounded-md border-l-2 px-4 py-3 text-left transition-colors duration-150 ease-out ${
                done ? 'border-l-success bg-success/10' : 'border-l-transparent hover:bg-elevated'
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  done ? 'border-success bg-success text-background' : 'border-border text-transparent'
                }`}
              >
                {done && <CheckCircle2 className="h-4 w-4" strokeWidth={2} />}
              </span>
              <span>
                <strong className="block text-sm font-medium">
                  {idx + 1}. {step.title}
                </strong>
                <span className="mt-1 block text-sm text-muted-foreground">{step.description}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 text-center">
        {allDone ? (
          <Button variant="brand" onClick={onDone}>
            I Have My ZIP File — Continue to Import
          </Button>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">
              Check off each step as you complete it ({checked.size}/{steps.length})
            </span>
            <br />
            <button
              onClick={onDone}
              className="mt-2 text-sm text-brand-300 underline-offset-4 hover:text-brand-400 hover:underline"
            >
              Skip checklist — I already have my ZIP
            </button>
          </>
        )}
      </div>
    </Card>
  )
}

export default Exporter
