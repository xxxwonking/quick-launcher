import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/renderer/**', 'node_modules/**', 'dist/**'],
    restoreMocks: true,
    clearMocks: true,
  },
})
