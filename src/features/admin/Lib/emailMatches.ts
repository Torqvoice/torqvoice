/** Whether what was typed is this address, the way the confirmation dialog compares it. */
export function emailMatches(typed: string, email: string): boolean {
  return typed.trim().toLowerCase() === email.trim().toLowerCase()
}
