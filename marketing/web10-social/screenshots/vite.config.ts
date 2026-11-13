// Screenshot-harness Vite config. Serves screenshots/harness/index.html with
// the data layer aliased to seeded mocks so the messages view (Chat) renders
// logged-in with content and no backend. See README.md.
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
      { find: 'posthog-js', replacement: path.resolve(root, 'node_modules/posthog-js') },
      { find: '@web10/discover/source-controls', replacement: path.resolve(root, '../shared/discover/src/sourceControls.ts') },
      { find: '@web10/discover/directory-controls', replacement: path.resolve(root, '../shared/discover/src/DirectoryControls.tsx') },
      { find: '@web10/discover/directory-mixer', replacement: path.resolve(root, '../shared/discover/src/directoryMixer.ts') },
      { find: '@web10/discover/use-directory-mixer', replacement: path.resolve(root, '../shared/discover/src/useDirectoryMixer.ts') },
      { find: '@web10/discover/source-models', replacement: path.resolve(root, '../shared/discover/src/sourceModels.ts') },
      { find: '@web10/discover/mixed-feed', replacement: path.resolve(root, '../shared/discover/src/mixedFeed.ts') },
      { find: '@web10/discover/feed-query', replacement: path.resolve(root, '../shared/discover/src/feedQuery.ts') },
      { find: 'react', replacement: path.resolve(root, 'node_modules/react') },
      { find: 'react-dom', replacement: path.resolve(root, 'node_modules/react-dom') },
      { find: 'react-router-dom', replacement: path.resolve(root, 'node_modules/react-router-dom') },
      { find: 'lucide-react', replacement: path.resolve(root, 'node_modules/lucide-react') },
      { find: /^(?:@\/data\/v3|\.\/v3)$/, replacement: path.resolve(here, './harness/mock-v3.ts') },
      { find: '@/data/wapi', replacement: path.resolve(here, './harness/mock-wapi.ts') },
      { find: /^@\/data\/settings$/, replacement: path.resolve(here, './harness/mock-settings.ts') },
      { find: /^@\/data\/p2p$/, replacement: path.resolve(here, './harness/mock-p2p.ts') },
      { find: /^@\/data\/notifications$/, replacement: path.resolve(here, './harness/mock-notifications.ts') },
      { find: /^@\/data\/messagesUnread$/, replacement: path.resolve(here, './harness/mock-messages-unread.ts') },
      { find: /^@\/data\/search$/, replacement: path.resolve(here, './harness/mock-search.ts') },
      { find: /^@\/data\/ads-catalog$/, replacement: path.resolve(here, './harness/mock-ads-catalog.ts') },
      { find: /^@\/data\/creator-analytics$/, replacement: path.resolve(here, './harness/mock-creator-analytics.ts') },
      { find: /^@\/data\/moderation$/, replacement: path.resolve(here, './harness/mock-moderation.ts') },
      { find: /^@\/data\/music$/, replacement: path.resolve(here, './harness/mock-music.ts') },
      { find: /^@\/data$/, replacement: path.resolve(here, './harness/mock-data.ts') },
      // The link-unfurl fetch seam (the harness has no preview server — the
      // canned cards stand in for the preview server's answers).
      { find: /^@\/lib\/unfurl$/, replacement: path.resolve(here, './harness/mock-unfurl.ts') },
      { find: '@', replacement: path.resolve(root, './src') },
    ],
  },
  server: { port: Number(process.env.SCREENSHOT_PORT || 4500), host: true, strictPort: true },
  // Only scan the harness entry — otherwise Vite crawls the app's own
  // index.html and errors on the many `@/data` exports the mock omits.
  optimizeDeps: { entries: ['screenshots/harness/index.html'] },
})
