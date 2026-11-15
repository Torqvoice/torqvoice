/**
 * A request the customer sent, as the title of a row:
 *
 *     <PortalListRow title={<PortalRequestText text={request.description} />} … />
 *
 * The quick choice the customer picked ("Something is wrong") stands on a
 * line of its own and their words follow under it, lighter, so the two never
 * read as one sentence. A request without a choice is its words alone. The
 * words are cut after three lines and keep the line breaks they were typed
 * with. `className` sets the type of the leading line (a theme's row title).
 */
import { splitRequestText } from '../../Lib/requestText'

export function PortalRequestText({ text, className }: { text: string; className?: string }) {
  const { topic, body } = splitRequestText(text)
  const lead = className ?? ''
  if (!topic) {
    return <span className={`${lead} line-clamp-3 whitespace-pre-line`.trim()}>{body}</span>
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span data-request-topic className={lead || undefined}>
        {topic}
      </span>
      <span
        data-request-words
        className="line-clamp-3 whitespace-pre-line text-[15px] font-normal leading-snug"
      >
        {body}
      </span>
    </span>
  )
}
