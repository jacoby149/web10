import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // config.ts reads REACT_APP_* overrides from import.meta.env — vite only
  // exposes VITE_* unless the prefix is widened, so without this the
  // docker-compose env vars (REACT_APP_DEFAULT_API etc.) never arrive.
  envPrefix: ['VITE_', 'REACT_APP_'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 80,
    host: true,
  },
  preview: {
    port: 80,
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
