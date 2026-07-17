import { useState, useCallback, useRef } from 'react'

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

const PLATFORMS: Array<{ key: Platform; label: string; icon: string; color: string }> = [
  { key: 'instagram', label: 'Instagram', icon: 'fab fa-instagram', color: '#E1306C' },
  { key: 'facebook', label: 'Facebook', icon: 'fab fa-facebook', color: '#1877F2' },
  { key: 'youtube', label: 'YouTube', icon: 'fab fa-youtube', color: '#FF0000' },
]

function track(event: string) {
  fetch(`${MARKETING_API}/analytics/funnel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, metadata: {} }),
  }).catch(() => {})
}

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
      track('sign_in_click')
    }
  }, [])

  const selectPlatform = useCallback((platform: Platform) => {
    setSelectedPlatform(platform)
    setShowChecklist(true)
    setChecklistDone(false)
    setProgress(null)
    setJobId(null)
    track(`${platform}_view`)
  }, [])

  const startPolling = useCallback((jid: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`${MARKETING_API}/import/${jid}`)
        const data = await res.json()
        setProgress(data)
        if (data.phase === 'complete' || data.phase === 'error') {
          if (pollRef.current) clearInterval(pollRef.current)
          if (data.phase === 'complete') track('export_complete')
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
      track('export_started')

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

  track('exporter_view')

  return (
    <div className="container" style={{ maxWidth: '800px', marginTop: '48px', marginBottom: '96px' }}>
      <h1 className="title" style={{ fontSize: '28px', marginBottom: '8px' }}>
        Import Your Social Life
      </h1>
      <p className="subtitle" style={{ color: '#7a7a7a', marginBottom: '32px' }}>
        Bring your posts, photos, comments, and contacts from any platform into your web10 node.
      </p>

      {!isSignedIn ? (
        <div className="notification is-warning">
          <strong>Sign in required.</strong> You need a web10 account to import data.
          <div style={{ marginTop: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a className="button is-primary" href="https://auth.web10.app">
              Sign In via web10
            </a>
            <button className="button is-light" onClick={handleSignIn}>
              Paste JWT Token
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <p style={{ color: '#7a7a7a', margin: 0 }}>
              Signed in as <strong>{username}</strong>
            </p>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <input
                className="input is-small"
                type="text"
                placeholder="Node API URL"
                value={nodeUrl}
                onChange={e => setNodeUrl(e.target.value)}
              />
            </div>
            <button className="button is-small is-text" onClick={() => { setIsSignedIn(false); setTokenInput('') }}>
              Sign Out
            </button>
          </div>

          {!selectedPlatform && (
            <div>
              <h2 className="title is-size-5" style={{ marginBottom: '16px' }}>
                Choose a Platform
              </h2>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {PLATFORMS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => selectPlatform(p.key)}
                    style={{
                      flex: '1 1 200px',
                      border: '2px solid #dbdbdb',
                      borderRadius: '8px',
                      padding: '24px',
                      cursor: 'pointer',
                      background: 'white',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.borderColor = p.color
                      el.style.background = p.color + '08'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.borderColor = '#dbdbdb'
                      el.style.background = 'white'
                    }}
                  >
                    <span style={{ fontSize: '32px', color: p.color, display: 'block', marginBottom: '12px' }}>
                      <i className={p.icon}></i>
                    </span>
                    <strong style={{ fontSize: '18px', color: '#363636' }}>{p.label}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedPlatform && (
            <div>
              <button
                className="button is-small is-text"
                onClick={() => {
                  setSelectedPlatform(null)
                  setShowChecklist(false)
                  setChecklistDone(false)
                }}
                style={{ marginBottom: '16px' }}
              >
                <span className="icon is-small"><i className="fas fa-arrow-left"></i></span>
                <span>Back to platforms</span>
              </button>

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
                  style={{
                    border: dragOver ? '3px solid #485fc7' : '2px dashed #dbdbdb',
                    borderRadius: '8px',
                    padding: '64px 24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: dragOver ? '#f5f7ff' : '#fafafa',
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleInputChange}
                    style={{ display: 'none' }}
                  />
                  <p style={{ fontSize: '20px', margin: '0 0 8px' }}>
                    {dragOver ? 'Drop your ZIP here' : 'Drag your ZIP here'}
                  </p>
                  <p style={{ color: '#7a7a7a', margin: 0 }}>
                    or click to browse files
                  </p>
                </div>
              )}

              {progress && progress.phase !== 'idle' && progress.phase !== 'complete' && (
                <div style={{ marginTop: '24px' }}>
                  <div className="tags">
                    <span className="tag is-info is-light">{progress.phase}</span>
                  </div>
                  <p style={{ color: '#7a7a7a', fontSize: '14px', marginTop: '8px' }}>
                    {progress.message}
                  </p>
                  {progress.total_records > 0 && (
                    <progress
                      className="progress is-small is-primary"
                      value={progress.written_records + progress.processed_files}
                      max={progress.total_records}
                      style={{ marginTop: '8px' }}
                    />
                  )}
                  {progress.errors.length > 0 && (
                    <div className="notification is-warning is-light" style={{ fontSize: '13px', marginTop: '12px' }}>
                      <strong>Warnings ({progress.errors.length}):</strong>
                      <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
                        {progress.errors.slice(0, 5).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {progress && progress.phase === 'complete' && (
                <div style={{ marginTop: '24px' }}>
                  <div className="notification is-success is-light">
                    <strong>
                      Import complete — {progress.written_records} records written
                      {progress.skipped_records > 0 && `, ${progress.skipped_records} skipped`}
                    </strong>
                  </div>

                  {Object.keys(progress.services_summary).length > 0 && (
                    <table className="table is-fullwidth is-hoverable" style={{ marginTop: '12px' }}>
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th>Written</th>
                          <th>Skipped</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(progress.services_summary).map(([service, stats]: [string, any]) => (
                          <tr key={service}>
                            <td>{service}</td>
                            <td>{stats.written}</td>
                            <td>{stats.skipped}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {progress.errors.length > 0 && (
                    <details style={{ marginTop: '12px' }}>
                      <summary style={{ cursor: 'pointer', color: '#7a7a7a' }}>
                        Show {progress.errors.length} errors
                      </summary>
                      <ul style={{ fontSize: '13px', color: '#7a7a7a', marginTop: '8px', paddingLeft: '20px' }}>
                        {progress.errors.slice(0, 20).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                    <button className="button is-primary" onClick={resetImporter}>
                      Import From Another Platform
                    </button>
                    <button
                      className="button is-light"
                      onClick={() => {
                        setProgress(null)
                        setChecklistDone(false)
                        setShowChecklist(true)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                    >
                      Import Another {selected ? selected.label : 'Platform'} Archive
                    </button>
                  </div>
                </div>
              )}

              {progress && progress.phase === 'error' && (
                <div style={{ marginTop: '24px' }}>
                  <div className="notification is-danger is-light">
                    <strong>Import failed</strong>
                    {progress.message && <p style={{ marginTop: '8px' }}>{progress.message}</p>}
                  </div>
                  {progress.errors.length > 0 && (
                    <ul style={{ fontSize: '13px', color: '#7a7a7a', paddingLeft: '20px' }}>
                      {progress.errors.slice(0, 10).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                    <button className="button is-primary" onClick={resetImporter}>
                      Try Again
                    </button>
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
      { title: 'Wait for Meta (1-3 days)', description: 'You\'ll get a notification when ready.' },
      { title: 'Download the ZIP', description: 'Download the ZIP file when Meta notifies you.' },
    ],
    facebook: [
      { title: 'Open Facebook', description: 'Go to facebook.com and log in.' },
      { title: 'Go to Settings', description: 'Settings & Privacy > Settings > Your information > Download your information.' },
      { title: 'Create a File', description: 'Click "Create File". Select all time range, JSON format, highest quality.' },
      { title: 'Select Data Types', description: 'Select Posts, Photos, and Friends. Click "Next" and confirm.' },
      { title: 'Wait for Meta (1-3 days)', description: 'You\'ll get a notification and email when ready.' },
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
    <div style={{ marginBottom: '32px' }}>
      <div className="box">
        <h2 className="title is-size-5">
          Getting Your {platformLabel} Data
        </h2>
        <p style={{ color: '#7a7a7a', marginBottom: '16px' }}>
          {platform === 'youtube'
            ? 'Google requires you to request your data export through Google Takeout.'
            : `${platformLabel} requires you to request your data export through their app or website.`}
          {' '}Follow these steps, then come back here with the ZIP file.
        </p>

        {steps.map((step, idx) => (
          <div
            key={idx}
            onClick={() => toggleStep(idx)}
            style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'flex-start',
              padding: '12px 16px',
              marginBottom: idx < steps.length - 1 ? '8px' : 0,
              borderRadius: '6px',
              cursor: 'pointer',
              background: checked.has(idx) ? '#f0faf0' : 'transparent',
              borderLeft: checked.has(idx) ? '3px solid #48c78e' : '3px solid transparent',
            }}
          >
            <span
              style={{
                width: '24px',
                height: '24px',
                minWidth: '24px',
                borderRadius: '50%',
                border: checked.has(idx) ? '2px solid #48c78e' : '2px solid #dbdbdb',
                background: checked.has(idx) ? '#48c78e' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: checked.has(idx) ? 'white' : 'transparent',
                fontSize: '12px',
                marginTop: '2px',
              }}
            >
              {checked.has(idx) ? '✓' : ''}
            </span>
            <div>
              <strong style={{ fontSize: '15px' }}>
                {idx + 1}. {step.title}
              </strong>
              <p style={{ margin: '4px 0 0', color: '#7a7a7a', fontSize: '14px' }}>
                {step.description}
              </p>
            </div>
          </div>
        ))}

        {allDone && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button className="button is-primary is-medium" onClick={onDone}>
              I Have My ZIP File — Continue to Import
            </button>
          </div>
        )}

        {!allDone && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <span style={{ color: '#7a7a7a', fontSize: '14px' }}>
              Check off each step as you complete it ({checked.size}/{steps.length})
            </span>
            <br />
            <button
              onClick={onDone}
              style={{
                background: 'none',
                border: 'none',
                color: '#485fc7',
                cursor: 'pointer',
                fontSize: '14px',
                marginTop: '8px',
                textDecoration: 'underline',
              }}
            >
              Skip checklist — I already have my ZIP
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Exporter
