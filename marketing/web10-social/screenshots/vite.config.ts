// Screenshot-harness Vite config. Serves screenshots/harness/index.html with
// the data layer aliased to seeded mocks so the messages views (Chat / Mail /
// CRM) render logged-in with content and no backend. See README.md.
//
// Alias order matters (first match wins): the exact `@/data` barrel and
// `@/data/wapi` are swapped for mocks; everything else under `@` (including
// `@/data/types`) resolves to real src/.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const here = path.resolve(__dirname)
const root = path.resolve(__dirname, '..')

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@/data/wapi', replacement: path.resolve(here, './harness/mock-wapi.ts') },
      { find: /^@\/data\/settings$/, replacement: path.resolve(here, './harness/mock-settings.ts') },
      { find: /^@\/data$/, replacement: path.resolve(here, './harness/mock-data.ts') },
      { find: '@', replacement: path.resolve(root, './src') },
    ],
  },
  server: { port: 4500, host: true, strictPort: true },
  // Only scan the harness entry — otherwise Vite crawls the app's own
  // index.html and errors on the many `@/data` exports the mock omits.
  optimizeDeps: { entries: ['screenshots/harness/index.html'] },
})
