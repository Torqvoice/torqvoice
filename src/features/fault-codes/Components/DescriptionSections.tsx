'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { FaultCodeSectionKind } from '@/features/integrations/Lib/types'
import type { FaultCodeSection } from '../Lib/types'

/** Above this many characters a section folds away behind "Show more". */
const FOLD_AT = 320

const HEADINGS: readonly FaultCodeSectionKind[] = [
  'how_it_works',
  'meaning',
  'causes',
  'manufacturer',
  'related',
  'diagnosis',
  'common_issues',
  'resolution',
  'advisory',
  'other',
]

/**
 * "What it means": the description in its labelled parts when the service
 * cuts it so, each under a small heading of the app's own, and the whole
 * description as one paragraph when it does not. A kind the app does not
 * know yet reads under "Good to know".
 *
 * Beside a job (`sheet`) long parts fold behind "Show more"; on the code's
 * own page there is room, so every part reads in full at a comfortable
 * line length, each marked by a thin line in the theme colour.
 */
export function DescriptionSections({
  sections,
  description,
  layout = 'sheet',
}: {
  sections: FaultCodeSection[]
  description: string | null
  layout?: 'sheet' | 'page'
}) {
  const t = useTranslations('faultCodes.sections')
  const page = layout === 'page'
  if (sections.length > 0) {
    return (
      <div className={page ? 'space-y-5' : 'space-y-3'}>
        {sections.map((section, i) => {
          const kind = HEADINGS.includes(section.kind) ? section.kind : 'other'
          return (
            <section
              key={`${section.kind}-${i}`}
              className={page ? 'space-y-1.5 border-l-2 border-primary/30 pl-4' : 'space-y-1'}
            >
              <h4
                className={
                  page
                    ? 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
                    : 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground'
                }
              >
                {t(kind)}
              </h4>
              <Foldable text={section.text} fold={!page} />
            </section>
          )
        })}
      </div>
    )
  }
  if (!description) return null
  return <Foldable text={description} fold={!page} />
}

function Foldable({ text, fold }: { text: string; fold: boolean }) {
  const t = useTranslations('faultCodes.detail')
  const long = fold && text.length > FOLD_AT
  const [open, setOpen] = useState(false)
  return (
    <div>
      <p
        className={cn(
          'whitespace-pre-line text-sm',
          fold ? 'leading-relaxed' : 'max-w-[88ch] leading-7 text-foreground/90',
          long && !open && 'line-clamp-4'
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-primary hover:underline"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? t('showLess') : t('showMore')}
        </button>
      )}
    </div>
  )
}
