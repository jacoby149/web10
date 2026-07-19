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
      '@': path.resolve(__dirname, './src'),
    },
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
