import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/**
 * The tests that need a real PostgreSQL: `npm run test:db`, with
 * E2E_DATABASE_URL pointing at a throwaway database that every migration
 * has been applied to. They are kept out of `npm test`, which has no
 * database, and run in CI from .github/workflows/restore-tenancy.yml.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/db/**/*.db.test.ts'],
    // One database, so one file at a time.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      'server-only': resolve(__dirname, './src/__tests__/stubs/server-only.ts'),
    },
  },
})
