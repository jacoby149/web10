export interface ImportRecord {
  service: string
  body: Record<string, unknown>
  origin: string
  originId?: string
}

export interface ImportProgress {
  phase: 'idle' | 'parsing' | 'mapping' | 'validating' | 'writing' | 'complete' | 'error'
  totalFiles: number
  processedFiles: number
  totalRecords: number
  writtenRecords: number
  skippedRecords: number
  errors: string[]
  currentService?: string
  message?: string
}

export interface ImportResult {
  success: boolean
  recordsWritten: number
  recordsSkipped: number
  errors: string[]
  servicesSummary: Record<string, { written: number; skipped: number }>
}

export type ProgressCallback = (progress: ImportProgress) => void

export interface ImportOptions {
  onProgress?: ProgressCallback
  validate?: boolean
  maxRetries?: number
}

export type Platform = 'instagram' | 'facebook' | 'youtube'

export interface WAPI {
  create(service: string, body: Record<string, unknown>): Promise<unknown>
  readToken(): { username: string; provider: string } | null
  isSignedIn(): boolean
}
