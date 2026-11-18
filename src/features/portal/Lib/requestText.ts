import { REQUEST_TOPIC_LABELS } from './requestTopics'

/**
 * What a customer sent from the booking page, taken apart for showing.
 *
 * The booking form offers quick choices ("Something is wrong", "Tyres") and
 * stores the chosen one as the first line of the request's description, a
 * blank line, then the customer's own words. Printed as one paragraph the two
 * run together ("Something is wrong A knocking noise…"), so every place that
 * shows a request shows the choice as a line of its own and the words after.
 *
 * A customer can also write several paragraphs without picking anything, so
 * a short first paragraph proves nothing: the first line is a choice only
 * when it is exactly one of the form's own labels, in any of the portal's
 * languages (`requestTopics.ts`). Everything else is shown as it was written.
 * A request has no column for the choice; with one, the form could send it
 * apart from the words and none of this would be read back out of the text.
 *
 * Server only (it knows every language's labels): a client component is
 * handed the parts by the page that renders it.
 */

export interface RequestTextParts {
  /** The quick choice, when the request starts with one and words follow it. */
  topic: string | null
  /** The customer's words; the whole text when there is no choice to set apart. */
  body: string
}

export function splitRequestText(text: string | null | undefined): RequestTextParts {
  const whole = (text ?? '').trim()
  const match = /^([^\r\n]+)\r?\n[ \t]*\r?\n([\s\S]+)$/.exec(whole)
  if (!match) return { topic: null, body: whole }
  const topic = match[1].trim()
  const body = match[2].trim()
  if (!body || !REQUEST_TOPIC_LABELS.has(topic)) return { topic: null, body: whole }
  return { topic, body }
}

/**
 * A request as one line, for the title of the work order made from it: the
 * choice, a colon, then the words, cut to `max` characters. The stored text
 * has a blank line between the two, which a title prints as a space, so the
 * choice ran into the words there too.
 */
export function requestTitle(text: string | null | undefined, max = 60): string {
  const { topic, body } = splitRequestText(text)
  const line = (topic ? `${topic}: ${body}` : body).replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 3)}...` : line
}
