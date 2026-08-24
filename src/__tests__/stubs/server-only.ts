/**
 * Stands in for the `server-only` package under vitest.
 *
 * That package exists to make a bundler fail when server code is pulled into a
 * client bundle. Vitest is neither, so importing the real thing only stops the
 * test from resolving, and modules that correctly declare themselves
 * server-only end up being the ones that cannot be tested.
 */
export {}
