import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  // D12 level-up (19.07.2026): @tailwindcss/vite was missing here, so the
  // Tailwind v4 pipeline never actually ran — the app shipped un/partially
  // styled. Wired to match ui/'s setup (design.md is the shared standard).
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      'posthog-js': path.resolve(__dirname, 'node_modules/posthog-js'),
      // Single instance: the shared @web10/discover package has no node_modules
      // of its own (a second react would break the hooks dispatcher), so its
      // bare imports resolve to THIS app's deps. Aliased explicitly because the
      // package is a sibling (node's walk-up can't reach the app's node_modules).
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react-router-dom': path.resolve(__dirname, 'node_modules/react-router-dom'),
      'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react'),
      'react-markdown': path.resolve(__dirname, 'node_modules/react-markdown'),
      'rehype-sanitize': path.resolve(__dirname, 'node_modules/rehype-sanitize'),
      'remark-breaks': path.resolve(__dirname, 'node_modules/remark-breaks'),
      'remark-gfm': path.resolve(__dirname, 'node_modules/remark-gfm'),
      clsx: path.resolve(__dirname, 'node_modules/clsx'),
      'tailwind-merge': path.resolve(__dirname, 'node_modules/tailwind-merge'),
      '@': path.resolve(__dirname, './src'),
      // D73: the shared discover card + video player (one source, both apps).
      // Aliased to the package source so Vite compiles it as app code (not
      // pre-bundled) — the file: dep in package.json keeps its deps resolvable.
      // The `/face` subpath is the PURE face resolver (no React) and
      // `/audio-artwork` the PURE album-art selector — the data layer imports
      // them directly so a `vi.mock('@/data')` never drags in the React
      // barrel. Must precede the barrel alias (string-prefix match).
      '@web10/discover/media-recovery': path.resolve(__dirname, '../shared/discover/src/mediaRecovery.ts'),
      '@web10/discover/source-controls': path.resolve(__dirname, '../shared/discover/src/sourceControls.ts'),
      '@web10/discover/directory-controls': path.resolve(__dirname, '../shared/discover/src/DirectoryControls.tsx'),
      '@web10/discover/directory-mixer': path.resolve(__dirname, '../shared/discover/src/directoryMixer.ts'),
      '@web10/discover/use-directory-mixer': path.resolve(__dirname, '../shared/discover/src/useDirectoryMixer.ts'),
      '@web10/discover/source-models': path.resolve(__dirname, '../shared/discover/src/sourceModels.ts'),
      '@web10/discover/mixed-feed': path.resolve(__dirname, '../shared/discover/src/mixedFeed.ts'),
      '@web10/discover/feed-query': path.resolve(__dirname, '../shared/discover/src/feedQuery.ts'),
      '@web10/discover/image': path.resolve(__dirname, '../shared/discover/src/ReliableImage.tsx'),
      '@web10/discover/video': path.resolve(__dirname, '../shared/discover/src/ReliableVideo.tsx'),
      '@web10/discover/face': path.resolve(__dirname, '../shared/discover/src/face.ts'),
      '@web10/discover/audio-artwork': path.resolve(__dirname, '../shared/discover/src/audioArtwork.ts'),
      // `/video-source` the PURE video-source selector (data layer + the music
      // transport import it directly, no React barrel — the same pattern).
      '@web10/discover/video-source': path.resolve(__dirname, '../shared/discover/src/videoSource.ts'),
      '@web10/discover/mentions': path.resolve(__dirname, '../shared/discover/src/mentions.ts'),
      '@web10/discover': path.resolve(__dirname, '../shared/discover/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@web10/discover'],
  },
  server: {
    port: 3000,
    host: true,
  },
  preview: {
    port: 3000,
    host: true,
  },
  test: {
    // Concurrent jsdom/React workers exhaust the host and cause false 5s timeouts.
    maxWorkers: 2,
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // D12 level-up: the legacy Crm/Mail/Bio(Bottom)/ContactAdder components
    // that imported rectangles-npm/@chatscope (D2.5 removed both from
    // package.json) are gone from src/ — nothing left to exclude.
    exclude: ['**/node_modules/**'],
  },
})
