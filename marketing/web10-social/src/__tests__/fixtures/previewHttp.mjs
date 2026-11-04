// Test-only real-process/HTTP fixture. No browser Node typings required.
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

export async function startPreviewFixture(handler) {
  const api = http.createServer(handler)
  api.listen(0, '127.0.0.1')
  await once(api, 'listening')
  const child = spawn(process.execPath, ['preview/server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, API_ORIGIN: `http://127.0.0.1:${api.address().port}`, SOCIAL_ORIGIN: 'https://social.test', PREVIEW_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  async function close() {
    if (child.exitCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
    await new Promise(resolve => api.close(resolve))
  }
  let port
  try {
    port = await new Promise((resolve, reject) => {
      let output = ''
      const timer = setTimeout(() => reject(new Error(`preview startup timed out: ${output}`)), 4000)
      const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value) }
      child.once('error', error => finish(error))
      child.once('exit', code => finish(new Error(`preview exited ${code}: ${output}`)))
      child.stderr.on('data', chunk => { output += chunk })
      child.stdout.on('data', chunk => {
        output += chunk
        const match = output.match(/server on :(\d+)/)
        if (match) finish(null, Number(match[1]))
      })
    })
  } catch (error) {
    await close()
    throw error
  }
  return {
    close,
    /** @returns {Promise<{status: number, html: string}>} */
    get(path) {
      return new Promise((resolve, reject) => {
        http.get({ hostname: '127.0.0.1', port, path }, res => {
          let html = ''
          res.on('data', chunk => { html += chunk })
          res.on('end', () => resolve({ status: res.statusCode, html }))
        }).on('error', reject)
      })
    },
  }
}
