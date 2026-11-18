/**
 * The support form's unsent subject and message, kept for as long as the tab.
 *
 * The form lives in React state, and the page under it can be replaced while
 * someone is still writing: a tab whose session ran out is sent to the sign-in
 * page and comes back, and a new build asks for a reload. Minutes of typing
 * went with it. sessionStorage survives both and ends with the tab, so a draft
 * does not follow the person around for weeks. Attachments are not kept; a
 * file cannot go into storage.
 */

export const SUPPORT_DRAFT_STORAGE_KEY = 'torqvoice.support.draft'

export interface SupportDraft {
  subject: string
  message: string
}

/**
 * The draft this person left in this tab, or null.
 *
 * A tab outlives a sign-out, so the draft carries who wrote it. One written by
 * somebody else is removed rather than handed to whoever signs in next on a
 * shared computer.
 */
export function readSupportDraft(userId: string): SupportDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { userId: owner, subject, message } = parsed as Record<string, unknown>
    if (owner !== userId) {
      window.sessionStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
      return null
    }
    if (typeof subject !== 'string' || typeof message !== 'string') return null
    return { subject, message }
  } catch {
    // Private browsing and locked-down profiles can throw on access, and a
    // corrupt value does not parse. Either way the form just starts empty.
    return null
  }
}

/** Keeps what is in the form. An empty form leaves nothing behind. */
export function writeSupportDraft(userId: string, draft: SupportDraft): void {
  if (typeof window === 'undefined') return
  try {
    if (draft.subject || draft.message) {
      window.sessionStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, JSON.stringify({ userId, ...draft }))
    } else {
      window.sessionStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
    }
  } catch {
    // The draft simply will not survive a reload.
  }
}

export function clearSupportDraft(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
  } catch {
    // Nothing was stored, so there is nothing to clear.
  }
}
