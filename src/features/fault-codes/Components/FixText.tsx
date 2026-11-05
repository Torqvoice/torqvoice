'use client'

import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

/** Only what the share dialog's editor writes. Raw HTML is never rendered. */
const ALLOWED = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'blockquote']

/**
 * A shared fix's text, formatted. Fixes are stored as Markdown; one sent as
 * plain text before the editor keeps its line breaks.
 */
export function FixText({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        'space-y-2 break-words text-sm leading-relaxed [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:whitespace-pre-line [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5',
        className
      )}
    >
      <ReactMarkdown allowedElements={ALLOWED} unwrapDisallowed skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}
