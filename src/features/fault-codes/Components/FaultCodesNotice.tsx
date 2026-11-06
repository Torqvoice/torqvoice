'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { MessageSquarePlus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { makeName } from '../Lib/makes'
import { HelpImproveDialog } from './HelpImproveDialog'

/**
 * Says fault codes are new and still growing, so a code that is not here yet
 * reads as "coming" rather than "broken", and which codes are covered: the
 * standard OBD codes, and BMW's own where the service serves them. Visible text rather than
 * a tooltip, because a tooltip never opens on a phone. "Help us improve" beside it lets a
 * workshop tell us where to find what is missing.
 */
export function FaultCodesNotice({
  className,
  makes = [],
  improve = null,
}: {
  className?: string
  /** The makes whose own codes the service serves ("bmw"), so the notice says so. */
  makes?: string[]
  /** "Help us improve", where the workshop reaches Torqvoice; with the code on screen, if any. */
  improve?: { code?: string | null } | null
}) {
  const t = useTranslations('faultCodes.notice')
  const ti = useTranslations('faultCodes.improve')
  const [open, setOpen] = useState(false)
  const locale = useLocale()
  const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })
  return (
    <div
      role="note"
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-nowrap',
        className
      )}
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        <p className="font-medium">{t('title')}</p>
        <p className="text-muted-foreground">
          {makes.length === 0
            ? t('body')
            : makes.length === 1 && makes[0] === 'bmw'
              ? t('bodyBmw')
              : t('bodyMakes', { makes: list.format(makes.map(makeName)) })}
        </p>
      </div>
      {improve && (
        <>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="ml-10 shrink-0 gap-1.5 bg-background sm:ml-0"
            onClick={() => {
              track('fault_code:improve_open', { with_code: Boolean(improve.code) })
              setOpen(true)
            }}
          >
            <MessageSquarePlus className="size-3.5" />
            {ti('button')}
          </Button>
          <HelpImproveDialog open={open} onOpenChange={setOpen} code={improve.code ?? null} />
        </>
      )}
    </div>
  )
}
