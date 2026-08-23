import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Lets server-only modules be imported directly by a test; see the stub.
      'server-only': resolve(__dirname, './src/__tests__/stubs/server-only.ts'),
    },
  },
})
