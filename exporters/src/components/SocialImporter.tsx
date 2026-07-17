import { useState, useCallback, useRef, useEffect } from 'react'
import { importArchive } from '../engine'
import type { ImportProgress, ImportResult, Platform } from '../types'
import { TakeoutChecklist } from './TakeoutChecklist'

const API_URL = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('api')) ||
  ((import.meta as any).env?.VITE_API_URL || 'https://api.web10.app')

interface WAPI {
  create(service: string, body: Record<string, unknown>): Promise<unknown>
  readToken(): { username: string; provider: string } | null
  isSignedIn(): boolean
  token: string | null
  setToken(token: string): void
}

const PLATFORMS: Array<{ key: Platform; label: string; icon: string; color: string }> = [
  { key: 'instagram', label: 'Instagram', icon: 'fab fa-instagram', color: '#E1306C' },
  { key: 'facebook', label: 'Facebook', icon: 'fab fa-facebook', color: '#1877F2' },
  { key: 'youtube', label: 'YouTube', icon: 'fab fa-youtube', color: '#FF0000' },
]

export function SocialImporter() {
  const [wapi, setWapi] = useState<WAPI | null>(null)
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [showChecklist, setShowChecklist] = useState(false)
  const [checklistDone, setChecklistDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    const init = async () => {
      const mod = await import('web10-npm' as any)
      const w = mod.wapiInit('https://auth.web10.app', [API_URL], 'rtc.web10.app')
      setWapi(w)
    }
    init()
  }, [])

  const selectPlatform = (platform: Platform) => {
    setSelectedPlatform(platform)
    setShowChecklist(true)
    setChecklistDone(false)
    setResult(null)
    setProgress(null)
  }

  const handleFile = useCallback(async (file: File) => {
    if (!wapi) return
    setResult(null)
    setShowChecklist(false)

    const res = await importArchive(wapi, file, {
      onProgress: setProgress,
      validate: true,
      maxRetries: 3,
    })
    setResult(res)
  }, [wapi])

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
    setProgress(null)
    setResult(null)
    setShowChecklist(false)
    setChecklistDone(false)
    setSelectedPlatform(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const token = wapi?.readToken()
  const selected = PLATFORMS.find(p => p.key === selectedPlatform)

  return (
    <div className="container" style={{ maxWidth: '800px', marginTop: '48px', marginBottom: '96px' }}>
      <h1 className="title" style={{ fontSize: '28px', marginBottom: '8px' }}>
        Import Your Social Life
      </h1>
      <p className="subtitle" style={{ color: '#7a7a7a', marginBottom: '32px' }}>
        Bring your posts, photos, comments, and contacts from any platform into your web10 node.
      </p>

      {!token ? (
        <div className="notification is-warning">
          <strong>Not signed in.</strong> Open this page from your web10 node&apos;s UI, or sign in first.
        </div>
      ) : (
        <div>
          <p style={{ color: '#7a7a7a', marginBottom: '24px' }}>
            Signed in as <strong>{token.username}</strong> @ {token.provider}
          </p>

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
                      el.style.borderColor = String(p.color)
                      el.style.background = String(p.color) + '08'
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
                    <span className="tag is-info is-light capitalize">{progress.phase}</span>
                  </div>
                  <p style={{ color: '#7a7a7a', fontSize: '14px', marginTop: '8px' }}>
                    {progress.message}
                  </p>
                  {progress.totalRecords > 0 && (
                    <progress
                      className="progress is-small is-primary"
                      value={progress.writtenRecords + progress.processedFiles}
                      max={progress.totalRecords}
                      style={{ marginTop: '8px' }}
                    />
                  )}
                  {progress.errors.length > 0 && (
                    <div className="notification is-warning is-light" style={{ fontSize: '13px', marginTop: '12px' }}>
                      <strong>Validation warnings ({progress.errors.length}):</strong>
                      <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
                        {progress.errors.slice(0, 5).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {result && (
                <div style={{ marginTop: '24px' }}>
                  <div className={`notification ${result.success ? 'is-success' : 'is-danger'} is-light`}>
                    <strong>
                      {result.success
                        ? `Import complete — ${result.recordsWritten} records written`
                        : `Import failed — ${result.recordsSkipped} errors`}
                    </strong>
                  </div>

                  {Object.keys(result.servicesSummary).length > 0 && (
                    <table className="table is-fullwidth is-hoverable" style={{ marginTop: '12px' }}>
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th>Written</th>
                          <th>Skipped</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(result.servicesSummary).map(([service, stats]) => (
                          <tr key={service}>
                            <td>{service}</td>
                            <td>{stats.written}</td>
                            <td>{stats.skipped}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {result.errors.length > 0 && (
                    <details style={{ marginTop: '12px' }}>
                      <summary style={{ cursor: 'pointer', color: '#7a7a7a' }}>
                        Show {result.errors.length} errors
                      </summary>
                      <ul style={{ fontSize: '13px', color: '#7a7a7a', marginTop: '8px', paddingLeft: '20px' }}>
                        {result.errors.slice(0, 20).map((e, i) => (
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
                        setResult(null)
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}
