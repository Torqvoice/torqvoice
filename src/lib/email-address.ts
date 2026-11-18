/**
 * Mail addresses as header values, without the header injection.
 *
 * A display name is whatever someone typed into a settings page, and it is
 * going into a mail header. Quotes, angle brackets and line breaks are
 * stripped rather than escaped: the name is a courtesy, the address is what
 * matters, and a mangled name beats a header the mailer refuses or a second
 * header smuggled in on a new line.
 */

const ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

/** A display name fit for a header: one line, no quoting characters, at most 120 characters. */
export function cleanDisplayName(name: string | null | undefined): string {
  return (name ?? '')
    .replace(/[\r\n"<>,;\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

/** `"Name" <address>`, or the bare address when the name is empty. */
export function formatMailAddress(name: string | null | undefined, email: string): string {
  const cleaned = cleanDisplayName(name)
  return cleaned ? `"${cleaned}" <${email}>` : email
}

/** The two halves of `Name <address>` or of a bare address; null when it is neither. */
export function parseMailAddress(value: string): { name: string; email: string } | null {
  const trimmed = value.trim()
  const angled = /^(.*?)<([^<>]+)>$/.exec(trimmed)
  if (angled) {
    const email = angled[2].trim()
    if (!ADDRESS.test(email)) return null
    const name = angled[1]
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .trim()
    return { name, email }
  }
  return ADDRESS.test(trimmed) ? { name: '', email: trimmed } : null
}

/** A lower-cased address with no name around it, or null when it is not an address. */
export function normalizeEmailAddress(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = parseMailAddress(value)
  if (!parsed) return null
  const email = parsed.email.toLowerCase()
  return email.length <= 254 ? email : null
}
