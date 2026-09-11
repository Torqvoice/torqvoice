'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppCard } from '@/components/app-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Percent, Plus, Save, X } from 'lucide-react'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { applyTaxRateToExisting } from '@/features/settings/Actions/applyTaxRateToExisting'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { useConfirm } from '@/components/confirm-dialog'
import { cn } from '@/lib/utils'
import { combinedTaxRate } from '@/lib/tax'
import {
  MAX_TAX_COMPONENTS,
  parseTaxComponentDefinitions,
  serializeTaxComponentDefinitions,
  TAX_COMPONENT_PRESETS,
} from '@/lib/tax-components'
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from '../read-only-guard'

/** A component as it sits in the form: the rate stays text until it is saved. */
interface ComponentRow {
  name: string
  rate: string
  registrationNumber: string
}

const EMPTY_ROW: ComponentRow = { name: '', rate: '', registrationNumber: '' }

function rowsFromSettings(value: string | undefined): ComponentRow[] {
  const parsed = parseTaxComponentDefinitions(value)
  if (!parsed) return [EMPTY_ROW, EMPTY_ROW]
  return parsed.map((c) => ({
    name: c.name,
    rate: String(c.rate),
    registrationNumber: c.registrationNumber ?? '',
  }))
}

/** The rows as definitions, or null when one is not filled in yet. */
function definitionsOf(rows: ComponentRow[]) {
  const defs = rows.map((row) => ({
    name: row.name.trim(),
    rate: Number(row.rate),
    registrationNumber: row.registrationNumber.trim() || undefined,
  }))
  if (defs.length === 0) return null
  if (defs.some((d) => !d.name || !Number.isFinite(d.rate) || d.rate < 0)) return null
  return defs
}

export function TaxSettings({
  settings,
  taxBackfillCounts,
}: {
  settings: Record<string, string>
  taxBackfillCounts: { serviceRecords: number; quotes: number }
}) {
  const router = useRouter()
  const t = useTranslations('settings')
  const confirm = useConfirm()

  const [saving, setSaving] = useState(false)
  const [applyingTax, setApplyingTax] = useState(false)
  const [taxEnabled, setTaxEnabled] = useState(settings[SETTING_KEYS.TAX_ENABLED] !== 'false')
  const [defaultTaxRate, setDefaultTaxRate] = useState(
    settings[SETTING_KEYS.DEFAULT_TAX_RATE] || '0'
  )
  const [taxInclusive, setTaxInclusive] = useState(settings[SETTING_KEYS.TAX_INCLUSIVE] === 'true')
  const [taxLabel, setTaxLabel] = useState(settings[SETTING_KEYS.TAX_LABEL] || '')
  const [lineItemsInclTax, setLineItemsInclTax] = useState(
    settings[SETTING_KEYS.INVOICE_LINE_ITEMS_INCL_TAX] === 'true'
  )
  // Off for every workshop that has not asked for it: the page then reads
  // exactly as it did before the split existed.
  const [splitTax, setSplitTax] = useState(settings[SETTING_KEYS.TAX_MODE] === 'split')
  const [components, setComponents] = useState<ComponentRow[]>(() =>
    rowsFromSettings(settings[SETTING_KEYS.TAX_COMPONENTS])
  )

  const splitDefinitions = definitionsOf(components)
  const combinedRate = splitDefinitions ? combinedTaxRate(splitDefinitions) : null
  // What the worked examples and the backfill quote: the combined rate when
  // the tax is split, the typed rate otherwise.
  const effectiveRate = splitTax ? String(combinedRate ?? 0) : defaultTaxRate

  const updateRow = (index: number, patch: Partial<ComponentRow>) =>
    setComponents((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const removeRow = (index: number) =>
    setComponents((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows))
  const addRow = () =>
    setComponents((rows) => (rows.length < MAX_TAX_COMPONENTS ? [...rows, EMPTY_ROW] : rows))
  const applyPreset = (id: string) => {
    const preset = TAX_COMPONENT_PRESETS.find((p) => p.id === id)
    if (!preset) return
    // Registration numbers are the workshop's own: a preset never touches
    // one already typed, and otherwise leaves the field for the user.
    setComponents(
      preset.components.map((c, i) => ({
        name: c.name,
        rate: String(c.rate),
        registrationNumber: components[i]?.registrationNumber ?? '',
      }))
    )
  }
  const toggleSplit = (on: boolean) => {
    // Leaving the split keeps the combined figure as the single rate, so the
    // workshop's default does not silently drop to zero.
    if (!on && combinedRate != null) setDefaultTaxRate(String(combinedRate))
    setSplitTax(on)
  }

  const handleSave = async () => {
    if (taxEnabled && splitTax && !splitDefinitions) {
      toast.error(t('tax.splitIncomplete'))
      return
    }
    setSaving(true)
    await setSettings({
      [SETTING_KEYS.TAX_ENABLED]: String(taxEnabled),
      [SETTING_KEYS.DEFAULT_TAX_RATE]: taxEnabled ? effectiveRate : '0',
      [SETTING_KEYS.TAX_INCLUSIVE]: String(taxInclusive),
      [SETTING_KEYS.TAX_LABEL]: taxLabel.trim(),
      [SETTING_KEYS.INVOICE_LINE_ITEMS_INCL_TAX]: String(lineItemsInclTax),
      [SETTING_KEYS.TAX_MODE]: taxEnabled && splitTax ? 'split' : 'single',
      [SETTING_KEYS.TAX_COMPONENTS]:
        taxEnabled && splitTax && splitDefinitions
          ? serializeTaxComponentDefinitions(splitDefinitions)
          : '',
    })
    setSaving(false)
    router.refresh()
    toast.success(t('currency.saved'))
  }

  const handleApplyTaxToExisting = async () => {
    const totalCount = taxBackfillCounts.serviceRecords + taxBackfillCounts.quotes
    if (totalCount === 0) {
      toast.info(t('currency.applyTaxNoRecords'))
      return
    }
    const ok = await confirm({
      title: t('currency.applyTaxConfirmTitle'),
      description: t('currency.applyTaxConfirmDescription', {
        rate: effectiveRate,
        serviceRecords: taxBackfillCounts.serviceRecords,
        quotes: taxBackfillCounts.quotes,
      }),
      confirmLabel: t('currency.applyTaxConfirmLabel'),
    })
    if (!ok) return

    setApplyingTax(true)
    const result = await applyTaxRateToExisting()
    setApplyingTax(false)

    if (result.success && result.data) {
      toast.success(
        t('currency.applyTaxSuccess', {
          serviceRecords: result.data.serviceRecordsUpdated,
          quotes: result.data.quotesUpdated,
        })
      )
      router.refresh()
    } else {
      toast.error(result.error || t('currency.applyTaxFailed'))
    }
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      <AppCard icon={Percent} title={t('tax.title')} contentClassName="space-y-6">
        <p className="text-sm text-muted-foreground">{t('tax.description')}</p>

        <ReadOnlyWrapper>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>{t('currency.enableTax')}</Label>
                <p className="text-xs text-muted-foreground">{t('currency.enableTaxHint')}</p>
              </div>
              <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
            </div>

            {taxEnabled && !splitTax && (
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="defaultTaxRate">{t('currency.defaultTaxRate')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('currency.defaultTaxRateHint')}
                  </p>
                </div>
                <div className="relative">
                  <Input
                    id="defaultTaxRate"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={defaultTaxRate}
                    onChange={(e) => setDefaultTaxRate(e.target.value)}
                    className="w-28 pr-8 text-right"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            )}

            {taxEnabled && !splitTax && (
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="taxLabel">{t('tax.labelLabel')}</Label>
                  <p className="text-xs text-muted-foreground">{t('tax.labelHint')}</p>
                </div>
                <Input
                  id="taxLabel"
                  type="text"
                  placeholder={t('tax.labelPlaceholder')}
                  value={taxLabel}
                  onChange={(e) => setTaxLabel(e.target.value)}
                  className="w-40"
                />
              </div>
            )}

            {/* Some places charge two taxes on the same invoice and want each
                on its own line with its own registration: Québec's GST and
                QST, India's CGST and SGST. Off, nothing below exists. */}
            {taxEnabled && (
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="taxSplit">{t('tax.splitLabel')}</Label>
                  <p className="text-xs text-muted-foreground">{t('tax.splitHint')}</p>
                </div>
                <Switch id="taxSplit" checked={splitTax} onCheckedChange={toggleSplit} />
              </div>
            )}

            {taxEnabled && splitTax && (
              <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label htmlFor="taxPreset">{t('tax.presetLabel')}</Label>
                  <Select onValueChange={applyPreset}>
                    <SelectTrigger id="taxPreset" className="w-full sm:w-72">
                      <SelectValue placeholder={t('tax.presetPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_COMPONENT_PRESETS.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {t(`tax.presets.${preset.labelKey}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="hidden grid-cols-[1fr_7rem_1fr_2rem] gap-2 text-xs text-muted-foreground sm:grid">
                    <span>{t('tax.componentName')}</span>
                    <span>{t('tax.componentRate')}</span>
                    <span>{t('tax.componentRegistration')}</span>
                    <span />
                  </div>
                  {components.map((row, index) => (
                    <div
                      key={index}
                      data-testid="tax-component-row"
                      className="grid grid-cols-[1fr_5rem_2rem] gap-2 sm:grid-cols-[1fr_7rem_1fr_2rem]"
                    >
                      <Input
                        id={`taxComponentName-${index}`}
                        aria-label={t('tax.componentName')}
                        placeholder={t('tax.componentNamePlaceholder')}
                        value={row.name}
                        onChange={(e) => updateRow(index, { name: e.target.value })}
                      />
                      <div className="relative">
                        <Input
                          id={`taxComponentRate-${index}`}
                          aria-label={t('tax.componentRate')}
                          type="number"
                          min="0"
                          step="0.001"
                          placeholder="0"
                          value={row.rate}
                          onChange={(e) => updateRow(index, { rate: e.target.value })}
                          className="pr-7 text-right"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                      <Input
                        id={`taxComponentRegistration-${index}`}
                        aria-label={t('tax.componentRegistration')}
                        placeholder={t('tax.componentRegistrationPlaceholder')}
                        value={row.registrationNumber}
                        onChange={(e) => updateRow(index, { registrationNumber: e.target.value })}
                        className="col-span-3 sm:col-span-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('tax.componentRemove')}
                        onClick={() => removeRow(index)}
                        disabled={components.length <= 1}
                        className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">{t('tax.registrationHint')}</p>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRow}
                    disabled={components.length >= MAX_TAX_COMPONENTS}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    {t('tax.addComponent')}
                  </Button>
                  <div className="text-right">
                    <p className="text-sm">
                      <span className="text-muted-foreground">{t('tax.combinedRate')}: </span>
                      <span className="font-semibold" data-testid="tax-combined-rate">
                        {combinedRate ?? '–'}%
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">{t('tax.combinedRateHint')}</p>
                  </div>
                </div>
              </div>
            )}

            {taxEnabled && (
              <div className="space-y-2">
                <Label>{t('tax.modeLabel')}</Label>
                <p className="text-xs text-muted-foreground">{t('tax.modeHint')}</p>
                <div className="inline-flex rounded-md border p-0.5">
                  <button
                    type="button"
                    onClick={() => setTaxInclusive(false)}
                    className={cn(
                      'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                      !taxInclusive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t('tax.modeExclusive')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaxInclusive(true)}
                    className={cn(
                      'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                      taxInclusive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t('tax.modeInclusive')}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {taxInclusive
                    ? t('tax.modeInclusiveExample', {
                        rate: effectiveRate || '0',
                      })
                    : t('tax.modeExclusiveExample', {
                        rate: effectiveRate || '0',
                      })}
                </p>
              </div>
            )}

            {/* How the sheet shows it, as distinct from how it was entered:
                a shop may key in prices before tax and still hand the
                customer lines they can add up to the total they pay. */}
            {taxEnabled && (
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="lineItemsInclTax">{t('tax.lineItemsInclTaxLabel')}</Label>
                  <p className="text-xs text-muted-foreground">{t('tax.lineItemsInclTaxHint')}</p>
                </div>
                <Switch
                  id="lineItemsInclTax"
                  checked={lineItemsInclTax}
                  onCheckedChange={setLineItemsInclTax}
                />
              </div>
            )}

            {/* Hidden for now: applying tax to existing records can drop
                  exclusive-mode invoices from "paid" to "partial" because the
                  recomputed totalAmount no longer matches the existing payments.
                  Re-enable once the backfill skips paid records. */}
            {false &&
              taxEnabled &&
              Number(effectiveRate) > 0 &&
              taxBackfillCounts.serviceRecords + taxBackfillCounts.quotes > 0 && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1 sm:max-w-xl">
                      <p className="text-sm font-medium">{t('currency.applyTaxToExistingLabel')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('currency.applyTaxToExistingHint', {
                          serviceRecords: taxBackfillCounts.serviceRecords,
                          quotes: taxBackfillCounts.quotes,
                        })}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={handleApplyTaxToExisting}
                      disabled={applyingTax}
                    >
                      {applyingTax ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {t('currency.applyTaxToExistingButton')}
                    </Button>
                  </div>
                </div>
              )}
          </div>
        </ReadOnlyWrapper>

        <SaveButton>
          <Separator />
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('currency.saveSettings')}
            </Button>
          </div>
        </SaveButton>
      </AppCard>
    </div>
  )
}
