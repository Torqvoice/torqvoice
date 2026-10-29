'use client'

import { Maximize2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { invoiceLabels } from '@/features/invoice-designer/Lib/invoiceLabels'
import {
  type PdfMessages,
  withMarineDocumentLabels,
} from '@/features/invoice-designer/Lib/marineLabels'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import type { DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'
import { SpecThumbnail } from '@/features/invoice-designer/Render/SpecThumbnail'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { Locale } from '@/i18n/config'
import { track } from '@/lib/analytics'
import { type PreviewSample, previewInvoiceInput } from '../../Lib/previewInvoice'
import type { SetupDraft } from '../../Lib/setupDraft'

interface LanguagePack {
  locale: Locale
  labels: Record<string, string>
  /** The same labels with a boat yard's words: vessel, HIN, engine hours. */
  marineLabels: Record<string, string>
  sample: PreviewSample
}

/** The printed labels and the sample job's prose, for one language. */
async function loadPack(locale: Locale): Promise<LanguagePack> {
  const [pdf, onboarding] = await Promise.all([
    import(`../../../../../messages/${locale}/pdf.json`),
    import(`../../../../../messages/${locale}/onboarding.json`),
  ])
  const labels = invoiceLabels(pdf.default, 'invoice')
  return {
    locale,
    labels,
    marineLabels: withMarineDocumentLabels(labels, pdf.default as PdfMessages),
    sample: onboarding.default.setup.sample,
  }
}

/** White kept beside and below the printed content, in points. */
const GUTTER = 14

/**
 * The page cropped to what is printed and drawn as wide as its box: the side
 * margins and the empty bottom of the page are cut. A whole A4 page in a side
 * column prints its text at about 5px; cropped, it is nearly twice that.
 */
function CroppedSheet({ spec }: { spec: DocumentSpec }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // The visible part of the page, in points: margins cut down to a gutter.
  const cropX = Math.max(0, Math.min(spec.page.margin.left, spec.page.margin.right) - GUTTER)
  const cropTop = Math.max(0, spec.page.margin.top - GUTTER)
  const scale = width ? width / (spec.page.width - cropX * 2) : 0

  // Where the printed content ends, in points, so the empty rest is not drawn.
  const [contentBottom, setContentBottom] = useState(0)
  useLayoutEffect(() => {
    const page = boxRef.current?.querySelector<HTMLElement>('[data-preview-page] > div > div')
    if (!page) return
    const measure = () => {
      let bottom = 0
      for (const child of Array.from(page.children) as HTMLElement[]) {
        // A side rail of a framed design runs the full page and ends nothing.
        if (child.offsetHeight >= spec.page.height * 0.9) continue
        bottom = Math.max(bottom, child.offsetTop + child.offsetHeight)
      }
      setContentBottom(bottom)
    }
    measure()
    // A logo loading or web fonts arriving change the content's height after
    // it is drawn, so it is measured again whenever its size changes.
    const observer = new ResizeObserver(measure)
    for (const child of Array.from(page.children)) observer.observe(child)
    void document.fonts?.ready.then(measure)
    return () => observer.disconnect()
  }, [spec, scale])

  const visibleHeight =
    Math.min(spec.page.height, (contentBottom || spec.page.height) + GUTTER) - cropTop

  return (
    <div
      ref={boxRef}
      className="relative overflow-hidden bg-white"
      style={{ height: scale ? Math.round(visibleHeight * scale) : undefined }}
    >
      {scale > 0 && (
        <div
          data-preview-page=""
          className="[&>div]:border-0!"
          style={{ position: 'absolute', left: -cropX * scale, top: -cropTop * scale }}
        >
          <SpecThumbnail spec={spec} height={spec.page.height * scale} />
        </div>
      )}
    </div>
  )
}

/**
 * The first invoice, drawn by the same builder and renderer as the real one,
 * in the language customers get. It follows every choice as it is made, and
 * opens at full size for a closer look.
 */
export function SetupPreview({ draft, caption }: { draft: SetupDraft; caption: string }) {
  const t = useTranslations('onboarding.setup.preview')
  const [pack, setPack] = useState<LanguagePack | null>(null)
  const [enlarged, setEnlarged] = useState(false)

  useEffect(() => {
    let alive = true
    loadPack(draft.locale)
      .then((next) => alive && setPack(next))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [draft.locale])

  const spec = useMemo(
    () =>
      pack
        ? buildInvoicePrintSpec(
            previewInvoiceInput(
              draft,
              draft.kind === 'marine' ? pack.marineLabels : pack.labels,
              pack.sample
            )
          )
        : null,
    [draft, pack]
  )

  return (
    <aside aria-label={t('label')} className="flex min-w-0 flex-col gap-3">
      <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
        {caption}
      </span>
      {spec ? (
        <button
          type="button"
          onClick={() => {
            track('workshop:setup_preview_open')
            setEnlarged(true)
          }}
          className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg text-left shadow-[0_18px_40px_rgba(70,52,18,0.10)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          lang={draft.locale}
        >
          <CroppedSheet spec={spec} />
          <span className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded-full bg-neutral-900/80 px-2.5 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
            {t('enlarge')}
          </span>
        </button>
      ) : (
        <div
          className="flex aspect-[1/1.414] items-center justify-center rounded-lg bg-white text-sm text-neutral-500"
          role="status"
        >
          {t('loading')}
        </div>
      )}

      <Dialog open={enlarged} onOpenChange={setEnlarged}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[820px] gap-3 overflow-y-auto p-4 sm:max-w-[820px] sm:p-5">
          <DialogTitle className="pr-10 text-[15px] font-semibold">{t('label')}</DialogTitle>
          <DialogDescription className="sr-only">{caption}</DialogDescription>
          {spec && (
            <div className="overflow-hidden rounded-md" lang={draft.locale}>
              <CroppedSheet spec={spec} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  )
}
