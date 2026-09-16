import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
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
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
