import { ZipReader, BlobReader, TextWriter, BlobWriter } from '@zip.js/zip.js'

export interface ZipEntry {
  path: string
  text: () => Promise<string>
  blob: () => Promise<Blob>
}

export async function readZipEntries(file: File): Promise<ZipEntry[]> {
  const reader = new ZipReader<Blob>(new BlobReader(file))
  const entries = await reader.getEntries()
  const dataEntries = entries.filter((e: any) => !e.directory)

  return dataEntries.map((entry: any) => ({
    path: entry.filename,
    text: async () => {
      const data = await entry.getData(new TextWriter())
      return typeof data === 'string' ? data : ''
    },
    blob: async () => {
      const data = await entry.getData(new BlobWriter())
      return data instanceof Blob ? data : new Blob()
    },
  }))
}

export function findJsonFiles(entries: ZipEntry[]): ZipEntry[] {
  return entries.filter(e => e.path.endsWith('.json'))
}

export function findMediaFiles(entries: ZipEntry[], extensions: string[]): ZipEntry[] {
  return entries.filter(e => {
    const lower = e.path.toLowerCase()
    return extensions.some(ext => lower.endsWith(ext))
  })
}

export function findEntryByPath(entries: ZipEntry[], path: string): ZipEntry | undefined {
  return entries.find(e => e.path === path || e.path.endsWith('/' + path))
}

export function findEntriesByPrefix(entries: ZipEntry[], prefix: string): ZipEntry[] {
  return entries.filter(e => e.path.startsWith(prefix))
}
