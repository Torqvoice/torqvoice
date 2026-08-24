import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The demo seed runs inside the production image, and that image is not the
 * repository. Its Dockerfile copies `prisma/` and `src/generated` and nothing
 * else, so an import reaching anywhere further into `src/` type-checks here,
 * passes review, and then kills the deploy job with MODULE_NOT_FOUND against a
 * file that plainly exists on the developer's disk.
 *
 * It has happened twice: once for the inspection template presets, once for
 * the tire hotel constants. Both are duplicated into the seed now, with the
 * original left as the source of truth. This is the check that stops a third.
 */

const SEED = 'prisma/seed_dummy_data.ts'

/** Directories the image actually ships, relative to the repository root. */
const SHIPPED = ['src/generated/']

describe('the demo seed', () => {
  it('imports nothing the production image leaves behind', () => {
    const source = fs.readFileSync(SEED, 'utf-8')

    // Covers `import ... from '../src/x'` and `await import('../src/x')`.
    const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
      (match) => match[1]
    )

    const reachesIntoSrc = specifiers
      .filter((specifier) => specifier.includes('src/'))
      .map((specifier) => specifier.replace(/^(?:\.\.?\/)+/, ''))
      .filter((specifier) => !SHIPPED.some((dir) => specifier.startsWith(dir)))

    expect(
      reachesIntoSrc,
      `${SEED} imports these, which the production image does not ship:\n` +
        `${reachesIntoSrc.join('\n')}\n` +
        `Copy what it needs into the seed instead, as the file already does for ` +
        `the inspection templates and the tire constants.`
    ).toEqual([])
  })
})
