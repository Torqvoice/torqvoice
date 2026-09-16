export const AI_MESSAGE_TYPES = {
  SUMMARY: 'summary',
  COMMON_ISSUES: 'common_issues',
} as const

/**
 * The workshop-wide assistant at /ai. Not part of the current release: while
 * false the sidebar has no link, the page is a 404 and its server actions
 * refuse. The record-scoped Ask AI sheet is separate and unaffected.
 */
export const WORKSHOP_CHAT_ENABLED = false
