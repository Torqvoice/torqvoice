'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { useGlassModal } from '@/components/glass-modal'
import { applyMarkupToAll } from '@/features/inventory/Actions/inventoryActions'
import {
  multiplierFromMarkupPercent,
  priceFromCostAndMultiplier,
} from '@/features/inventory/Lib/partPricing'
import { setSetting } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

/** What the worked example prices. A round number reads the same in any currency. */
const EXAMPLE_COST = 100

interface ApplyMarkupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The markup the dialog opens with, as a percentage: 30 for cost + 30%. */
  initialPercent: number
  /** Called with the saved multiplier once the catalog is repriced. */
  onApplied: (multiplier: number) => void
}

/**
 * Reprices the inventory catalog from cost plus a percentage, and saves that
 * percentage as what a new part's sell price fills in with.
 *
 * The markup is asked for as a percentage and shown as a worked example before
 * anything is applied. It used to be a bare multiplier, which sat next to a
 * percentage setting of nearly the same name: 30 typed for "30%" priced every
 * part at thirty times its cost, and the only clue was a line of small grey
 * text.
 */
export function ApplyMarkupDialog({
  open,
  onOpenChange,
  initialPercent,
  onApplied,
}: ApplyMarkupDialogProps) {
  const t = useTranslations('inventory')
  // Held here rather than in the form: the form is remounted every time the
  // dialog opens, and a run that is still going must outlive that. While it is
  // set the dialog cannot be dismissed, so it cannot be reopened to start a
  // second catalog-wide update over the first.
  const [applying, setApplying] = useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!applying) onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!applying}>
        <DialogHeader>
          <DialogTitle>{t('markup.title')}</DialogTitle>
          <DialogDescription>{t('markup.intro')}</DialogDescription>
        </DialogHeader>
        {/* Mounted with the dialog, so a percentage that was typed and then
            cancelled is gone the next time it opens. */}
        <ApplyMarkupForm
          initialPercent={initialPercent}
          applying={applying}
          onApplyingChange={setApplying}
          onCancel={() => onOpenChange(false)}
          onApplied={(multiplier) => {
            onApplied(multiplier)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function ApplyMarkupForm({
  initialPercent,
  applying,
  onApplyingChange,
  onCancel,
  onApplied,
}: {
  initialPercent: number
  applying: boolean
  onApplyingChange: (applying: boolean) => void
  onCancel: () => void
  onApplied: (multiplier: number) => void
}) {
  const t = useTranslations('inventory')
  const tSettings = useTranslations('settings')
  const tNav = useTranslations('navigation')
  const format = useFormatter()
  const formatCurrency = useFormatCurrency()
  const modal = useGlassModal()
  const [percent, setPercent] = useState(String(initialPercent))
  const [overrideExisting, setOverrideExisting] = useState(false)

  const multiplier = multiplierFromMarkupPercent(percent)
  const invalid = percent.trim() !== '' && multiplier === null
  const examplePrice =
    multiplier === null ? null : priceFromCostAndMultiplier(EXAMPLE_COST, multiplier)

  const handleApply = async () => {
    if (multiplier === null || applying) return
    onApplyingChange(true)
    try {
      const result = await applyMarkupToAll({ multiplier, overrideExisting })
      if (!result.success) {
        modal.open('error', t('errors.error'), result.error || t('errors.applyFailed'))
        return
      }
      // Saved only once the catalog has been repriced with it. Sent alongside
      // the update, a markup the update refused was remembered all the same.
      await setSetting(SETTING_KEYS.INVENTORY_MARKUP_MULTIPLIER, String(multiplier))
      onApplied(multiplier)
    } catch {
      modal.open('error', t('errors.error'), t('errors.applyFailed'))
    } finally {
      onApplyingChange(false)
    }
  }

  return (
    <>
      <DialogBody className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="markupPercent">{t('markup.percentLabel')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="markupPercent"
              type="number"
              inputMode="decimal"
              min="-99.99"
              step="0.1"
              className="w-28"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              aria-invalid={invalid}
              aria-describedby="markupPercentHint"
            />
            <span className="text-sm text-muted-foreground" aria-hidden="true">
              %
            </span>
          </div>
          <p
            id="markupPercentHint"
            className={invalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
          >
            {invalid ? t('markup.percentInvalid') : t('markup.percentHint')}
          </p>
        </div>

        {examplePrice !== null && (
          <div className="rounded-md border bg-muted/40 p-3" aria-live="polite">
            <p className="text-xs font-medium text-muted-foreground">{t('markup.exampleTitle')}</p>
            <dl className="mt-2 grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">{t('form.unitCost')}</dt>
                <dd className="text-sm tabular-nums">{formatCurrency(EXAMPLE_COST)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t('markup.exampleMarkup', {
                    percent: format.number(Number(percent), { maximumFractionDigits: 2 }),
                  })}
                </dt>
                <dd className="text-sm tabular-nums">
                  {formatCurrency(examplePrice - EXAMPLE_COST)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('form.sellPrice')}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {formatCurrency(examplePrice)}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <Switch checked={overrideExisting} onCheckedChange={setOverrideExisting} />
            <span className="text-sm">{t('markup.overrideExisting')}</span>
          </label>
          <p className="text-xs text-muted-foreground">
            {overrideExisting ? t('markup.overrideExistingHint') : t('markup.skipExistingHint')}
          </p>
        </div>

        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          <li>
            {t('markup.newPartsNote', {
              sellPrice: t('form.sellPrice'),
              unitCost: t('form.unitCost'),
            })}
          </li>
          <li>
            {t('markup.settingsNote', {
              setting: tSettings('workshop.defaultMarkupPercent'),
              settings: tNav('breadcrumbs.settings'),
              workshop: tNav('breadcrumbs.workshop'),
            })}
          </li>
        </ul>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={applying}>
          {t('markup.cancel')}
        </Button>
        <Button onClick={handleApply} disabled={applying || multiplier === null}>
          {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('markup.apply')}
        </Button>
      </DialogFooter>
    </>
  )
}
