// The fake-curl test seam (the .mjs — no browser node typings needed in the
// .ts test, the same pattern as previewHttp.mjs). Writes the fake curl
// script to a temp dir, points makeCurlStealthFetch at it, runs the test,
// and cleans up. The script body is a POSIX sh parse of the EXACT argv the
// adapter passes (`-s -S --max-redirs 0 --max-time N -D <hdr> -H … <url>`):
// `--version` answers the availability probe; anything else writes the
// header dump to the -D file and echoes the body to stdout.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function withFakeCurl(scriptBody, run) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-curl-'))
  const bin = join(dir, 'fake-curl.sh')
  writeFileSync(bin, scriptBody, { mode: 0o755 })
  const { makeCurlStealthFetch } = await import('../../../preview/unfurl.mjs')
  const fetchWithCurl = makeCurlStealthFetch(bin)
  try {
    return await run(fetchWithCurl)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
