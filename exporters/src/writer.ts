import type { WAPI } from './types'
import type { ImportRecord } from './types'

export interface WriteResult {
  id: string | null
  success: boolean
  error?: string
}

export async function writeRecord(
  wapi: WAPI,
  record: ImportRecord,
  maxRetries = 3
): Promise<WriteResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await wapi.create(record.service, record.body)
      return {
        id: typeof res === 'string' ? res : (res as { data?: string })?.data ?? null,
        success: true,
      }
    } catch (err) {
      if (attempt === maxRetries - 1) {
        return {
          id: null,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        }
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  return { id: null, success: false, error: 'Max retries exceeded' }
}

export async function writeBatch(
  wapi: WAPI,
  records: ImportRecord[],
  onProgress?: (index: number, total: number) => void,
  maxRetries = 3
): Promise<{ written: WriteResult[]; skipped: WriteResult[] }> {
  const written: WriteResult[] = []
  const skipped: WriteResult[] = []

  for (let i = 0; i < records.length; i++) {
    const result = await writeRecord(wapi, records[i], maxRetries)
    if (result.success) {
      written.push(result)
    } else {
      skipped.push({ ...result, id: null })
    }
    onProgress?.(i + 1, records.length)
    if (i < records.length - 1) {
      await new Promise(r => setTimeout(r, 50))
    }
  }

  return { written, skipped }
}
