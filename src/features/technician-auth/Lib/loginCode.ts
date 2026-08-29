import { createHash, randomInt } from 'node:crypto'

/**
 * The one-time code a technician signs back in with.
 *
 * Six digits, because it is typed with a thumb, read off a lock screen, and
 * increasingly not typed at all: both platforms will offer it to the field
 * from the message it arrived in. Anything longer buys entropy that the
 * attempt limit below already provides more cheaply.
 */

/** How long a code is worth anything. Long enough to fetch a phone from an
 * overall pocket, short enough to be useless by the time it is overheard. */
export const LOGIN_CODE_TTL_MS = 5 * 60 * 1000

/**
 * Wrong guesses before the code dies.
 *
 * Six digits is a million, which sounds like plenty and is not: rate limiting
 * by address does nothing about a hundred machines sharing the work. Five
 * attempts against one code makes the space irrelevant, because the code is
 * gone long before the guessing gets anywhere.
 */
export const MAX_ATTEMPTS = 5

export function generateLoginCode(): string {
  // randomInt, not Math.random. This is a credential.
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashLoginCode(code: string): string {
  return createHash('sha256').update(normalizeLoginCode(code)).digest('hex')
}

/** Spaces and dashes get typed and pasted; nothing else is part of a code. */
export function normalizeLoginCode(input: string): string {
  return input.replace(/\D/g, '')
}

/**
 * The text of the message.
 *
 * Names the workshop, because a technician who works somewhere else too
 * should be able to tell which shop is asking. Says the app's name, because
 * an unattributed code is what every phishing message looks like. Leads with
 * the digits so the notification preview carries them, which is what makes
 * the phone offer to fill the field.
 */
export function loginMessage(code: string, workshop: string): string {
  return `${code} is your Torqvoice Tech sign-in code for ${workshop}. It expires in five minutes.`
}
