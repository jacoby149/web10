import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
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
      // D103: the cross-app surface tests (src/lib/posthogSurfaces.test.ts) import
      // the social/authenticator analytics sources, whose own node_modules are
      // not installed in this app's CI job — alias the shared package source
      // explicitly (specific subpath first).
      '@web10/telemetry/runtime': path.resolve(__dirname, '../shared/telemetry/src/runtime.ts'),
      '@web10/telemetry': path.resolve(__dirname, '../shared/telemetry/src/index.ts'),
      // Remaining group/App Store pages use Markdown and reliable images,
      // not the retired marketing feed/mixer/player (D111).
      '@web10/discover/media-recovery': path.resolve(__dirname, '../shared/discover/src/mediaRecovery.ts'),
      '@web10/discover/image': path.resolve(__dirname, '../shared/discover/src/ReliableImage.tsx'),
      '@web10/discover': path.resolve(__dirname, '../shared/discover/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@web10/discover'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
