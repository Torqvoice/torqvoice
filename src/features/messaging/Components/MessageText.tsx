import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { tokenizeMessage } from '../Lib/messageText'

/**
 * Message text with its links clickable and its emphasis honoured.
 *
 * Every piece is rendered as an element rather than as markup, so nothing a
 * sender writes can become HTML, and a long address wraps instead of pushing
 * the bubble past the edge of the pane.
 */
export function MessageText({ body, className }: { body: string; className?: string }) {
  return (
    <p className={cn('whitespace-pre-wrap break-words text-sm', className)}>
      {tokenizeMessage(body).map((token, index) =>
        token.type === 'link' ? (
          <a
            key={`${index}-${token.href}`}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:no-underline"
          >
            {token.value}
          </a>
        ) : (
          <Fragment key={`${index}-${token.value}`}>
            <span
              className={cn(
                token.bold && 'font-semibold',
                token.italic && 'italic',
                token.strike && 'line-through'
              )}
            >
              {token.value}
            </span>
          </Fragment>
        )
      )}
    </p>
  )
}
