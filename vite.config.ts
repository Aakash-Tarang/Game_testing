import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: { clientPort: 443 },
    cors: true,
    // @ts-ignore
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 5173
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
})
