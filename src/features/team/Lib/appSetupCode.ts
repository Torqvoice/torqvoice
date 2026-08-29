import { createHash, randomInt } from 'node:crypto'

/**
 * The one-time code that puts a technician's phone onto a workshop.
 *
 * Two ways in, one credential: the desk shows a QR the phone reads, and the
 * same characters are printed underneath for a technician who has already left
 * the building and is on the phone instead.
 */

/**
 * No `O`/`0`, no `I`/`1`, no `S`/`5`.
 *
 * The whole point of the typed fallback is that it survives being read aloud
 * across a workshop and written on the back of a hand. A character anyone has
 * to ask about costs more than the entropy it adds.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789'

/**
 * Eight, not six.
 *
 * The redeem endpoint has to be reachable without credentials, so the only
 * thing standing between a guesser and somebody's session is the size of this
 * space and the rate limiter. Six characters is about a billion, which a
 * botnet can make a real dent in inside the ten minutes a code lives. Eight is
 * a thousand times more, and is still two groups of four read down a phone.
 */
const LENGTH = 8

/** How long a code is worth anything. Long enough to install an app on shop
 * wifi, short enough that a photograph of the screen is stale by the time
 * anyone acts on it. */
export const SETUP_CODE_TTL_MS = 10 * 60 * 1000

/** Generates a code. `randomInt` rather than `Math.random`: this is a credential. */
export function generateSetupCode(): string {
  let code = ''
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

/**
 * What goes in the database.
 *
 * A plain hash rather than a password hash, because the input is already
 * high-entropy and the row is worthless ten minutes later. It means a look at
 * the table hands over nobody's session.
 */
export function hashSetupCode(code: string): string {
  return createHash('sha256').update(normalizeSetupCode(code)).digest('hex')
}

/**
 * What a technician typed, turned into what was generated.
 *
 * Case and the separators only: lower case, spaces, and the dash from the
 * grouped display all get typed and none of them are part of the code.
 *
 * Deliberately no folding of confusable characters. The usual trick is to map
 * a typed `O` onto `0`, which works when the alphabet keeps one of each pair.
 * This one keeps neither, so a typed `O` has no single character it could have
 * meant, and guessing at one risks turning a misread into a different valid
 * code. A misread fails the lookup and is told so, which is the honest answer.
 */
export function normalizeSetupCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Grouped for reading aloud: `ABCD-EFGH`. */
export function formatSetupCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}
