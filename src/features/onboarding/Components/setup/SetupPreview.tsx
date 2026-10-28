'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { invoiceLabels } from '@/features/invoice-designer/Lib/invoiceLabels'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { SpecThumbnail } from '@/features/invoice-designer/Render/SpecThumbnail'
import type { Locale } from '@/i18n/config'
import { type PreviewSample, previewInvoiceInput } from '../../Lib/previewInvoice'
import type { SetupDraft } from '../../Lib/setupDraft'

interface LanguagePack {
  locale: Locale
  labels: Record<string, string>
  sample: PreviewSample
}

/** The printed labels and the sample job's prose, for one language. */
async function loadPack(locale: Locale): Promise<LanguagePack> {
  const [pdf, onboarding] = await Promise.all([
    import(`../../../../../messages/${locale}/pdf.json`),
    import(`../../../../../messages/${locale}/onboarding.json`),
  ])
  return {
    locale,
    labels: invoiceLabels(pdf.default, 'invoice'),
    sample: onboarding.default.setup.sample,
  }
}

/**
 * The first invoice, drawn by the same builder and renderer as the real one,
 * in the language customers get. It follows every choice as it is made.
 */
export function SetupPreview({ draft, caption }: { draft: SetupDraft; caption: string }) {
  const t = useTranslations('onboarding.setup.preview')
  const [pack, setPack] = useState<LanguagePack | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    let alive = true
    loadPack(draft.locale)
      .then((next) => alive && setPack(next))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [draft.locale])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  const spec = useMemo(
    () =>
      pack ? buildInvoicePrintSpec(previewInvoiceInput(draft, pack.labels, pack.sample)) : null,
    [draft, pack]
  )
  const height = spec && width ? Math.round((width * spec.page.height) / spec.page.width) : 0

  return (
    <aside aria-label={t('label')} className="flex min-w-0 flex-col gap-3">
      <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
        {caption}
      </span>
      <div
        ref={boxRef}
        className="overflow-hidden rounded-lg bg-white shadow-[0_18px_40px_rgba(70,52,18,0.10)]"
        lang={draft.locale}
      >
        {spec && height > 0 ? (
          <SpecThumbnail spec={spec} height={height} />
        ) : (
          <div
            className="flex aspect-[1/1.414] items-center justify-center text-sm text-muted-foreground"
            role="status"
          >
            {t('loading')}
          </div>
        )}
      </div>
    </aside>
  )
}
