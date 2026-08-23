/**
 * Small shared bits of how a conversation looks in a list.
 *
 * Extracted when the inbox stopped being SMS-only: the same customer should
 * carry the same initials and the same colour whichever channel the thread
 * arrived on.
 */

/** Initials for the avatar: first letters of the first two words. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

const AVATAR_TINTS = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
]

/** Stable per-name tint, so the same customer always looks the same. */
export function avatarTint(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]
}
