import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/renderer/**/*.test.ts', 'src/renderer/**/*.test.tsx'],
    setupFiles: ['src/renderer/src/test-setup.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
})
