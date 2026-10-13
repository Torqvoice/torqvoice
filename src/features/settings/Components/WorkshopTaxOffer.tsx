'use client'

import { createContext, useContext, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ratesMatch } from '@/lib/tax'
import { applyWorkshopTaxToDocument } from '../Actions/applyWorkshopTaxToDocument'

/**
 * The offer to put a document on the workshop's tax, for the totals card.
 *
 * A work order or quote keeps the rate it was created with. One opened
 * before the workshop turned tax on shows no tax, and nothing on the page
 * said why or what to do about it. The page that knows whether the offer
 * stands (see workshopTaxOffer on the server) provides it here, and the
 * totals card shows it; with nothing provided, nothing is shown.
 */
export interface TaxOfferValue {
  /** The workshop's rate. */
  rate: number
  /** The rate the document carries now. */
  currentRate: number
  /** Applies it. Resolves when the document has been re-totalled. */
  apply: () => Promise<void>
}

const TaxOfferContext = createContext<TaxOfferValue | null>(null)

export const WorkshopTaxOfferProvider = TaxOfferContext.Provider

export function WorkshopTaxOfferPrompt() {
  const offer = useContext(TaxOfferContext)
  const t = useTranslations('service.taxOffer')
  const [applying, setApplying] = useState(false)
  if (!offer) return null

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs"
      data-testid="workshop-tax-offer"
    >
      <span className="min-w-0 flex-1 text-amber-800 dark:text-amber-300">
        {offer.currentRate > 0
          ? t('otherRate', { current: offer.currentRate, rate: offer.rate })
          : t('noTax', { rate: offer.rate })}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 shrink-0 text-xs"
        disabled={applying}
        onClick={async () => {
          setApplying(true)
          try {
            await offer.apply()
          } catch (error) {
            toast.error(error instanceof Error && error.message ? error.message : t('failed'))
          } finally {
            setApplying(false)
          }
        }}
      >
        {applying && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
        {t('apply', { rate: offer.rate })}
      </Button>
    </div>
  )
}

/**
 * The offer as a page holds it: what the server found, narrowed by what has
 * happened on the page since, with the click that takes it. Null as soon as
 * the document is locked or finished, or its rate already is the workshop's
 * (somebody typed it into the totals).
 */
export function useTaxOfferValue(args: {
  offer: { rate: number; currentRate: number } | null | undefined
  kind: 'workOrder' | 'quote'
  id: string
  locked: boolean
  finished: boolean
  taxRate: number
  /**
   * Saves what is on screen and says whether the page is clean afterwards.
   * A save the form refuses (a row without a name, a locked document)
   * resolves like any other, so the answer has to be asked for: applying
   * the tax ends in a reload, and a reload over unsaved edits loses them.
   */
  saveFirst: () => Promise<boolean>
  /** Shown when that save did not go through. */
  unsavedMessage: string
}): TaxOfferValue | null {
  const { offer, kind, id, locked, finished, taxRate, saveFirst, unsavedMessage } = args
  if (!offer || locked || finished || ratesMatch(taxRate, offer.rate)) return null
  return {
    rate: offer.rate,
    currentRate: taxRate,
    apply: async () => {
      // Nothing is applied and nothing reloaded over edits that are still
      // on screen only; the form has already said what is wrong with them.
      if (!(await saveFirst())) throw new Error(unsavedMessage)
      const result = await applyWorkshopTaxToDocument({ kind, id })
      if (!result.success) throw new Error(result.error || '')
      // The editor holds the rate, the split and every line's flag in its own
      // state; a full load is the one way to be sure it shows what was stored.
      window.location.reload()
    },
  }
}
