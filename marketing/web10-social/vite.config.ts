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
      // Single instance: the shared @web10/discover package has no node_modules
      // of its own (a second react would break the hooks dispatcher), so its
      // bare imports resolve to THIS app's deps. Aliased explicitly because the
      // package is a sibling (node's walk-up can't reach the app's node_modules).
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react'),
      clsx: path.resolve(__dirname, 'node_modules/clsx'),
      'tailwind-merge': path.resolve(__dirname, 'node_modules/tailwind-merge'),
      '@': path.resolve(__dirname, './src'),
      // D73: the shared discover card + video player (one source, both apps).
      // Aliased to the package source so Vite compiles it as app code (not
      // pre-bundled) — the file: dep in package.json keeps its deps resolvable.
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
