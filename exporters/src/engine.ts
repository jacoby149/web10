import { readZipEntries, findJsonFiles } from './zip'
import type { ZipEntry } from './zip'
import {
  parseInstagramPostFile,
  parseInstagramProfile,
  parseInstagramFollows,
  isInstagramZip,
} from './instagram/mapping'
import {
  isFacebookZip,
  detectFacebookFile,
  parseFacebookFile,
} from './facebook/mapping'
import {
  isYouTubeZip,
  detectYouTubeFile,
  parseYouTubeFile,
} from './youtube/mapping'
import { createValidator, validateRecord } from './validation'
import {
  postsSchema,
  mediaSchema,
  commentsSchema,
  contactsSchema,
  profileSchema,
} from './schemas'
import type { ImportRecord, ImportProgress, ImportResult, ImportOptions, WAPI, ProgressCallback } from './types'
import { writeBatch } from './writer'

const validators: Record<string, ReturnType<typeof createValidator>> = {
  posts: createValidator(postsSchema),
  media: createValidator(mediaSchema),
  comments: createValidator(commentsSchema),
  contacts: createValidator(contactsSchema),
  profile: createValidator(profileSchema),
}

const initialProgress: ImportProgress = {
  phase: 'idle',
  totalFiles: 0,
  processedFiles: 0,
  totalRecords: 0,
  writtenRecords: 0,
  skippedRecords: 0,
  errors: [],
}

function makeProgress(
  cb: ProgressCallback | undefined,
  phase: ImportProgress['phase'],
  extra: Partial<ImportProgress> = {}
) {
  const progress: ImportProgress = { ...initialProgress, phase, ...extra }
  cb?.(progress)
  return progress
}

type Platform = 'instagram' | 'facebook' | 'youtube' | 'unknown'

function detectPlatform(entries: ZipEntry[]): Platform {
  if (isInstagramZip(entries)) return 'instagram'
  if (isFacebookZip(entries)) return 'facebook'
  if (isYouTubeZip(entries)) return 'youtube'
  return 'unknown'
}

async function parseInstagram(entries: ZipEntry[], onProgress?: ProgressCallback): Promise<ImportRecord[]> {
  const allRecords: ImportRecord[] = []
  const jsonEntries = findJsonFiles(entries)

  const profile = await parseInstagramProfile(entries)
  if (profile) allRecords.push(profile)

  const follows = await parseInstagramFollows(entries)
  allRecords.push(...follows)

  const postEntries = jsonEntries.filter(e =>
    e.path.includes('posts/') && e.path.endsWith('.json')
  )

  for (let i = 0; i < postEntries.length; i++) {
    const records = await parseInstagramPostFile(postEntries[i])
    allRecords.push(...records)
    makeProgress(onProgress, 'mapping', {
      totalFiles: postEntries.length,
      processedFiles: i + 1,
      totalRecords: allRecords.length,
      message: `Parsed ${i + 1}/${postEntries.length} Instagram posts...`,
    })
  }

  return allRecords
}

async function parseFacebook(entries: ZipEntry[], onProgress?: ProgressCallback): Promise<ImportRecord[]> {
  const allRecords: ImportRecord[] = []
  const jsonEntries = findJsonFiles(entries)

  for (let i = 0; i < jsonEntries.length; i++) {
    const entry = jsonEntries[i]
    const type = detectFacebookFile(entry)
    if (!type) continue

    const records = await parseFacebookFile(entry, type)
    allRecords.push(...records)
    makeProgress(onProgress, 'mapping', {
      totalFiles: jsonEntries.length,
      processedFiles: i + 1,
      totalRecords: allRecords.length,
      message: `Parsed ${type} (${i + 1}/${jsonEntries.length})...`,
    })
  }

  return allRecords
}

async function parseYouTube(entries: ZipEntry[], onProgress?: ProgressCallback): Promise<ImportRecord[]> {
  const allRecords: ImportRecord[] = []
  const jsonEntries = findJsonFiles(entries)

  for (let i = 0; i < jsonEntries.length; i++) {
    const entry = jsonEntries[i]
    const type = detectYouTubeFile(entry)
    if (!type) continue

    const records = await parseYouTubeFile(entry, type)
    allRecords.push(...records)
    makeProgress(onProgress, 'mapping', {
      totalFiles: jsonEntries.length,
      processedFiles: i + 1,
      totalRecords: allRecords.length,
      message: `Parsed ${type} (${i + 1}/${jsonEntries.length})...`,
    })
  }

  return allRecords
}

async function detectAndParse(file: File, onProgress?: ProgressCallback): Promise<ImportRecord[]> {
  const entries = await readZipEntries(file)
  const jsonEntries = findJsonFiles(entries)

  makeProgress(onProgress, 'parsing', {
    totalFiles: entries.length,
    message: `Found ${entries.length} entries in archive, detecting source...`,
  })

  const platform = detectPlatform(entries)

  if (platform === 'unknown') {
    makeProgress(onProgress, 'error', {
      errors: ['Unrecognized archive format. Supported: Instagram, Facebook, YouTube data exports.'],
      message: 'This does not appear to be a supported data export.',
    })
    throw new Error('Unrecognized archive format')
  }

  makeProgress(onProgress, 'mapping', {
    totalFiles: jsonEntries.length,
    message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} export detected. Parsing ${jsonEntries.length} JSON files...`,
  })

  switch (platform) {
    case 'instagram': return parseInstagram(entries, onProgress)
    case 'facebook': return parseFacebook(entries, onProgress)
    case 'youtube': return parseYouTube(entries, onProgress)
  }
}

export async function importArchive(
  wapi: WAPI,
  file: File,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { onProgress, validate = true, maxRetries = 3 } = options

  if (!wapi.isSignedIn()) {
    makeProgress(onProgress, 'error', {
      errors: ['Not signed in. Please authenticate with your web10 node first.'],
      message: 'Authentication required',
    })
    return {
      success: false,
      recordsWritten: 0,
      recordsSkipped: 1,
      errors: ['Not signed in'],
      servicesSummary: {},
    }
  }

  let records: ImportRecord[]

  try {
    records = await detectAndParse(file, onProgress)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse archive'
    makeProgress(onProgress, 'error', {
      errors: [msg],
      message: msg,
    })
    return {
      success: false,
      recordsWritten: 0,
      recordsSkipped: 0,
      errors: [msg],
      servicesSummary: {},
    }
  }

  if (records.length === 0) {
    makeProgress(onProgress, 'error', {
      errors: ['No importable records found in the archive.'],
      message: 'No records found',
    })
    return {
      success: false,
      recordsWritten: 0,
      recordsSkipped: 0,
      errors: ['No importable records found'],
      servicesSummary: {},
    }
  }

  if (validate) {
    makeProgress(onProgress, 'validating', {
      totalRecords: records.length,
      message: `Validating ${records.length} records against schemas...`,
    })

    const validRecords: ImportRecord[] = []
    const validationErrors: string[] = []

    for (const record of records) {
      const validator = validators[record.service]
      if (validator) {
        const result = validateRecord(validator, record.body)
        if (!result.valid) {
          validationErrors.push(
            `[${record.service}] ${record.originId ?? 'unknown'}: ${result.errors?.[0] ?? 'validation failed'}`
          )
        } else {
          validRecords.push(record)
        }
      } else {
        validRecords.push(record)
      }
    }

    if (validationErrors.length > 0) {
      makeProgress(onProgress, 'validating', {
        errors: validationErrors.slice(0, 20),
        message: `${validationErrors.length} records failed validation and will be skipped.`,
      })
    }

    records = validRecords
  }

  const byService = new Map<string, ImportRecord[]>()
  for (const record of records) {
    const group = byService.get(record.service) ?? []
    group.push(record)
    byService.set(record.service, group)
  }

  const servicesSummary: Record<string, { written: number; skipped: number }> = {}
  let totalWritten = 0
  let totalSkipped = 0
  const allErrors: string[] = []

  for (const [service, serviceRecords] of byService) {
    makeProgress(onProgress, 'writing', {
      totalRecords: records.length,
      writtenRecords: totalWritten,
      skippedRecords: totalSkipped,
      currentService: service,
      message: `Writing ${serviceRecords.length} ${service} records...`,
    })

    const { written, skipped } = await writeBatch(
      wapi,
      serviceRecords,
      (idx) => {
        makeProgress(onProgress, 'writing', {
          totalRecords: records.length,
          writtenRecords: totalWritten + idx,
          skippedRecords: totalSkipped + skipped.length,
          currentService: service,
          message: `Writing ${service}: ${idx}/${serviceRecords.length}...`,
        })
      },
      maxRetries
    )

    totalWritten += written.length
    totalSkipped += skipped.length
    allErrors.push(...skipped.map(s => `[${service}] ${s.error ?? 'write failed'}`))
    servicesSummary[service] = { written: written.length, skipped: skipped.length }
  }

  const success = totalWritten > 0
  makeProgress(onProgress, success ? 'complete' : 'error', {
    totalRecords: records.length,
    writtenRecords: totalWritten,
    skippedRecords: totalSkipped,
    errors: allErrors.slice(0, 50),
    message: success
      ? `Import complete: ${totalWritten} records written, ${totalSkipped} skipped.`
      : `Import failed: ${totalSkipped} errors.`,
  })

  return {
    success,
    recordsWritten: totalWritten,
    recordsSkipped: totalSkipped,
    errors: allErrors,
    servicesSummary,
  }
}
