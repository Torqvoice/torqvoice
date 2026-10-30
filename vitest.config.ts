import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    // Playwright owns e2e/. Without this, vitest's default glob picks up the
    // .spec.ts files there and fails on an import it cannot resolve.
    // The database-backed tests have their own config (vitest.db.config.ts).
    exclude: ['e2e/**', 'src/__tests__/db/**', '**/node_modules/**', '**/dist/**', '**/.next/**'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Lets server-only modules be imported directly by a test; see the stub.
      'server-only': resolve(__dirname, './src/__tests__/stubs/server-only.ts'),
    },
  },
})
