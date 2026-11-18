/**
 * What the passkey client reports when the browser's own passkey prompt was
 * closed rather than completed: dismissed or left to time out (a browser does
 * not say which, both arrive as `NotAllowedError`), or replaced by a newer
 * prompt. Nothing went wrong, so nothing is said.
 */
const PROMPT_CLOSED_CODES: readonly string[] = [
  'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
  'ERROR_CEREMONY_ABORTED',
]

export function passkeyErrorCode(error: object): string | undefined {
  const code = 'code' in error ? error.code : undefined
  return typeof code === 'string' ? code : undefined
}

export function isPasskeyPromptClosed(error: object): boolean {
  const code = passkeyErrorCode(error)
  return code !== undefined && PROMPT_CLOSED_CODES.includes(code)
}
