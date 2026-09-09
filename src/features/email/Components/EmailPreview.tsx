'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EMAIL_DESIGN_WIDTH } from './EmailThumbnail'

export type PreviewWidth = 'desktop' | 'mobile'
export type PreviewView = 'html' | 'text'

const WIDTHS: Record<PreviewWidth, number> = { desktop: EMAIL_DESIGN_WIDTH, mobile: 375 }

/** How long a pause in typing is before the frame is rewritten. */
const CANVAS_SETTLE_MS = 80

/**
 * The value once it has stopped changing for `delay`. The first value is
 * taken at once, so the frame has a document from its first paint.
 */
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

/**
 * The mail as the customer meets it: a row in an inbox, then the message.
 *
 * The inbox row is there because the subject and the first line are what
 * decide whether a mail is opened at all, and nothing else in the designer
 * shows them side by side. The width is the closest a preview can get to a
 * phone; the text view shows the part some readers see instead. Both are
 * chosen in the designer's top bar.
 *
 * The mail itself is the canvas: the block selected in the rail is outlined
 * here and scrolled into view, and a click on a block here selects it in the
 * rail. The rendered HTML carries a data-block mark on every row for that,
 * which only the preview asks the renderer for.
 */
export function EmailPreview({
  from,
  subject,
  previewLine,
  html,
  text,
  width,
  view,
  selected,
  onSelect,
}: {
  from: string
  subject: string
  previewLine: string
  /** Rendered with `marked`, so every row knows which block it is. */
  html: string
  text: string
  width: PreviewWidth
  view: PreviewView
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const t = useTranslations('settings.emailTemplates')
  const px = WIDTHS[width]
  const initial = (from.trim()[0] ?? '?').toUpperCase()
  // The inbox row and the text view follow every keystroke; the frame, which
  // reloads a whole document on each change, waits for the typing to pause.
  const canvasHtml = useSettled(html, CANVAS_SETTLE_MS)

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 justify-center overflow-auto px-6 py-6">
        <div
          className="flex max-w-full flex-col overflow-hidden rounded-[10px] border border-border bg-card text-card-foreground shadow-lg"
          style={{ width: px, minHeight: 0 }}
        >
          <div className="flex flex-none items-center gap-3 border-b border-border px-4 py-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13.5px] font-semibold">
                  {from || t('inboxNoSender')}
                </span>
                <span className="flex-none text-[11.5px] text-muted-foreground">
                  {t('inboxNow')}
                </span>
              </div>
              <div className="truncate text-[13px]">
                <span className="font-medium">{subject || t('inboxNoSubject')}</span>
                {previewLine && <span className="text-muted-foreground"> {previewLine}</span>}
              </div>
            </div>
          </div>

          {view === 'html' ? (
            <MailCanvas
              title={subject.trim() || t('htmlView')}
              html={canvasHtml}
              width={px}
              selected={selected}
              onSelect={onSelect}
            />
          ) : (
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-muted p-5 font-mono text-[12.5px] leading-relaxed text-foreground">
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The rendered mail in a frame the designer can reach into.
 *
 * Same origin, so the parent can outline a row and listen for clicks without
 * a script inside the document; no scripts allowed, so nothing in the mail
 * can run. Every edit rewrites the document, which would throw the scroll
 * position away, so it is remembered and put back on each load: typing in
 * the footer must not send the preview back to the top on every keystroke.
 */
function MailCanvas({
  title,
  html,
  width,
  selected,
  onSelect,
}: {
  title: string
  html: string
  width: number
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const scrollTop = useRef(0)
  const [loads, setLoads] = useState(0)
  // Which selection the frame has already scrolled to, so a reload caused by
  // typing restores the scroll position rather than jumping to the block.
  const scrolledTo = useRef<string | null>(null)

  const frameDoc = useCallback(() => frame.current?.contentDocument ?? null, [])

  // Clicks in the mail select the block they land on; a click beside the
  // blocks selects nothing, which is the subject and theme in the rail.
  useEffect(() => {
    const doc = frameDoc()
    if (!doc) return
    const onClick = (event: MouseEvent) => {
      event.preventDefault()
      const target = event.target as HTMLElement | null
      const row = target?.closest?.('[data-block]') as HTMLElement | null
      onSelect(row?.dataset.block ?? null)
    }
    const onScroll = () => {
      scrollTop.current = doc.documentElement.scrollTop || doc.body?.scrollTop || 0
    }
    doc.addEventListener('click', onClick)
    doc.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      doc.removeEventListener('click', onClick)
      doc.removeEventListener('scroll', onScroll)
    }
  }, [loads, frameDoc, onSelect])

  // Outline the selected block. After a reload, first put the scroll back
  // where it was; only a fresh selection scrolls the mail.
  useEffect(() => {
    const doc = frameDoc()
    if (!doc) return
    const rows = Array.from(doc.querySelectorAll<HTMLElement>('[data-block]'))
    let hit: HTMLElement | null = null
    for (const row of rows) {
      const isSelected = row.dataset.block === selected
      row.classList.toggle('is-selected', isSelected)
      if (isSelected) hit = row
    }
    if (scrolledTo.current !== selected) {
      scrolledTo.current = selected
      if (hit) hit.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else {
      doc.documentElement.scrollTop = scrollTop.current
    }
  }, [loads, selected, frameDoc])

  return (
    <iframe
      ref={frame}
      title={title}
      sandbox="allow-same-origin"
      srcDoc={html}
      tabIndex={-1}
      onLoad={() => setLoads((n) => n + 1)}
      className="min-h-0 flex-1"
      style={{ width, border: 0, display: 'block' }}
    />
  )
}
