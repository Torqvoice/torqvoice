/** How long a booked job's name may be before it is cut, as on a portal request. */
const TITLE_LENGTH = 60

/**
 * What the customer asked for, one concern per line and in the order given.
 * Each prints under "work requested" on the work order and is answered on
 * its own when the car is in.
 */
export function appointmentConcerns(work: string): string[] {
  return work
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * The job's name on the calendar and the work board: the first thing asked
 * for, which is what the person reading the day needs to see.
 */
export function appointmentTitle(work: string): string {
  const first = appointmentConcerns(work)[0] ?? work.trim()
  return first.length > TITLE_LENGTH ? `${first.slice(0, TITLE_LENGTH - 3)}...` : first
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
}

/**
 * A description as plain lines: one per paragraph, list item or line break,
 * with the formatting gone. This is how what was typed as a description
 * becomes a job's conditions, which are plain text. Text that was never rich
 * text comes back as its own lines.
 */
export function descriptionLines(html: string | null | undefined): string[] {
  if (!html) return []
  return appointmentConcerns(
    html
      .replace(/<br\s*\/?>|<\/(p|li|div|h[1-6]|blockquote|pre|tr)>/gi, '\n')
      // Only what is written as a tag: "pressure < 2 bar, voltage > 12 V" and
      // "<post@example.com>" are the customer's words and stay.
      .replace(/<\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?>/gi, '')
      .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (_, name: string) => ENTITIES[name])
  )
}

/** Plain lines as the description an appointment keeps: a paragraph each. */
export function linesAsDescription(lines: string[]): string {
  return lines
    .map(
      (line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
    )
    .join('')
}

/** `more` after `lines`, leaving out what is already said word for word. */
export function withoutRepeats(lines: string[], more: string[]): string[] {
  const seen = new Set(lines)
  const all = [...lines]
  for (const line of more) {
    if (seen.has(line)) continue
    seen.add(line)
    all.push(line)
  }
  return all
}
