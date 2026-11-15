import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin calls to the data service during development (the real backend: uvicorn app.main:app --port 8000).
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: { include: ['src/**/*.test.ts'] },
})
