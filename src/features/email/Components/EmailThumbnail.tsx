'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { buildEmailSpec } from '../Lib/buildEmailSpec'
import type { SummaryRow } from '../Lib/emailContext'
import { kindSpec } from '../Lib/emailKinds'
import { type EmailTemplate, emailLogoPublicPath } from '../Lib/emailTemplate'
import { renderEmailHtml } from '../Render/renderEmailHtml'
import type { TagValues } from '../Lib/tags'

/** The stand-in data a preview is filled with, worked out once on the server. */
export interface EmailSampleData {
  values: TagValues
  summary: SummaryRow[]
}

/** The width the mail is designed at; every client narrower than this wraps it. */
export const EMAIL_DESIGN_WIDTH = 600

/**
 * The mail a template produces, as one HTML document for a frame.
 *
 * The attachment note is always drawn: the preview is for seeing every block
 * the template has, and a note that only appears on a real send with a PDF
 * would look like it had gone missing. The logo is the template's own,
 * fetched from the public route the way a mail client would.
 */
export function previewHtml(template: EmailTemplate, sample: EmailSampleData) {
  const spec = buildEmailSpec(template, {
    values: sample.values,
    summary: sample.summary,
    logoUrl: emailLogoPublicPath(template.theme.logoUrl),
    attached: kindSpec(template.kind).hasAttachment,
  })
  return renderEmailHtml(spec)
}

/**
 * A rendered mail in a frame of its own.
 *
 * An iframe rather than dangerouslySetInnerHTML, because the mail is a whole
 * document with its own body background and nothing from the app's
 * stylesheet may leak into it: what the card shows has to be what the
 * customer's client shows. The sandbox is empty, so nothing in it can run or
 * navigate, and pointer events are off so a click lands on the card.
 */
export function EmailFrame({
  html,
  width,
  className,
  style,
  title,
}: {
  html: string
  width: number
  className?: string
  style?: React.CSSProperties
  title: string
}) {
  return (
    <iframe
      title={title}
      sandbox=""
      srcDoc={html}
      tabIndex={-1}
      aria-hidden
      className={className}
      style={{ width, border: 0, pointerEvents: 'none', display: 'block', ...style }}
    />
  )
}

/**
 * A template's card, scaled to whatever width the card gives it.
 *
 * The mail is rendered at its design width and shrunk with a transform, so
 * the thumbnail is the real mail and not a mock-up of one. The height is
 * fixed and the bottom is clipped; a card shows the top of the mail, which
 * is where the difference between two templates is.
 */
export function EmailThumbnail({
  template,
  sample,
  height = 170,
  className,
}: {
  template: EmailTemplate
  sample: EmailSampleData
  height?: number
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState(0)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setBoxWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const html = useMemo(() => previewHtml(template, sample), [template, sample])
  const scale = boxWidth > 0 ? boxWidth / EMAIL_DESIGN_WIDTH : 1

  return (
    <div
      ref={box}
      className={cn('relative overflow-hidden rounded', className)}
      // The mail's own ground, so the top of the card matches the mail below it.
      style={{ height, background: template.theme.backgroundColor }}
    >
      {boxWidth > 0 && (
        <EmailFrame
          title={template.name}
          html={html}
          width={EMAIL_DESIGN_WIDTH}
          style={{
            height: height / scale,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      )}
    </div>
  )
}
