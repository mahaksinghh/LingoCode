import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [react()],
  server: {
    proxy: { '/api': loadEnv(mode, '.', 'LINGOCODE_').LINGOCODE_API_URL ?? 'http://127.0.0.1:8000' },
    fs: { allow: ['../..'] },
  },
  test: { environment: 'jsdom' },
}))
