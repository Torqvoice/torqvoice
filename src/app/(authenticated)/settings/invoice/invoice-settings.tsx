'use client'

import { AppCard } from '@/components/app-card'
import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { backfillCustomerNumbers } from '@/features/customers/Actions/customerActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { FileText, Loader2, Save } from 'lucide-react'
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from '../read-only-guard'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/confirm-dialog'
import {
  type InvoiceLayoutConfig,
  getDefaultInvoiceLayout,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { CustomFieldsManager } from '@/features/custom-fields/Components/CustomFieldsManager'

type TabType = 'general' | 'customFields'

interface FieldDef {
  id: string
  name: string
  label: string
  fieldType: string
  entityType: string
  options: string | null
  required: boolean
  sortOrder: number
  isActive: boolean
}

interface InvoiceSettingsProps {
  settings: Record<string, string>
  /** Fills the layout preview with this workshop's own letterhead. */
  workshop?: { name?: string; address?: string; phone?: string; email?: string; slogan?: string }
  unnumberedCustomers?: number
  initialInvoiceLayout?: InvoiceLayoutConfig
  initialQuoteLayout?: InvoiceLayoutConfig
  customFields: FieldDef[]
  customFieldsEnabled: boolean
  telegramEnabled?: boolean
}

export function InvoiceSettings({
  settings,
  workshop,
  unnumberedCustomers = 0,
  initialInvoiceLayout,
  initialQuoteLayout,
  customFields,
  customFieldsEnabled,
  telegramEnabled = false,
}: InvoiceSettingsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('settings')
  const [saving, setSaving] = useState(false)

  const tab = (searchParams.get('tab') as TabType) || 'general'
  const setTab = useCallback(
    (newTab: TabType) => {
      const params = new URLSearchParams(searchParams.toString())
      if (newTab === 'general') {
        params.delete('tab')
      } else {
        params.set('tab', newTab)
      }
      const qs = params.toString()
      router.replace(`/settings/invoice${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [router, searchParams]
  )

  // General tab state
  const [invoicePrefix, setInvoicePrefix] = useState(
    settings[SETTING_KEYS.INVOICE_PREFIX] ?? '{year}-'
  )
  const [invoiceStartNumber, setInvoiceStartNumber] = useState(
    settings[SETTING_KEYS.INVOICE_START_NUMBER] || ''
  )
  const [quotePrefix, setQuotePrefix] = useState(settings[SETTING_KEYS.QUOTE_PREFIX] ?? 'QT-')
  const [quoteValidDays, setQuoteValidDays] = useState(
    settings[SETTING_KEYS.QUOTE_VALID_DAYS] ?? '30'
  )
  const [dueDays, setDueDays] = useState(settings[SETTING_KEYS.INVOICE_DUE_DAYS] || '14')
  const [footerNote, setFooterNote] = useState(settings[SETTING_KEYS.INVOICE_FOOTER_NOTE] || '')
  const [defaultMarkupPercent, setDefaultMarkupPercent] = useState(
    settings[SETTING_KEYS.PARTS_DEFAULT_MARKUP_PERCENT] || '0'
  )
  const [markupAppliesToInventory, setMarkupAppliesToInventory] = useState(
    settings[SETTING_KEYS.PARTS_MARKUP_APPLIES_TO_INVENTORY] === 'true'
  )

  const handleSaveGeneral = async () => {
    setSaving(true)
    await setSettings({
      [SETTING_KEYS.INVOICE_PREFIX]: invoicePrefix,
      [SETTING_KEYS.QUOTE_PREFIX]: quotePrefix,
      [SETTING_KEYS.QUOTE_VALID_DAYS]: quoteValidDays,
      [SETTING_KEYS.INVOICE_START_NUMBER]: invoiceStartNumber,
      [SETTING_KEYS.INVOICE_DUE_DAYS]: dueDays,
      [SETTING_KEYS.INVOICE_FOOTER_NOTE]: footerNote,
      [SETTING_KEYS.PARTS_DEFAULT_MARKUP_PERCENT]: defaultMarkupPercent,
      [SETTING_KEYS.PARTS_MARKUP_APPLIES_TO_INVENTORY]: markupAppliesToInventory ? 'true' : 'false',
    })
    setSaving(false)
    router.refresh()
    toast.success(t('invoice.saved'))
  }

  const confirm = useConfirm()
  const [assigning, setAssigning] = useState(false)
  const [unnumbered, setUnnumbered] = useState(unnumberedCustomers)
  const handleAssignCustomerNumbers = async () => {
    const ok = await confirm({
      title: t('invoice.assignCustomerNumbersConfirmTitle'),
      description: t('invoice.assignCustomerNumbersConfirmDescription', { count: unnumbered }),
      confirmLabel: t('invoice.assignCustomerNumbers'),
    })
    if (!ok) return
    setAssigning(true)
    const result = await backfillCustomerNumbers()
    setAssigning(false)
    if (result.success && result.data) {
      setUnnumbered(0)
      toast.success(t('invoice.customerNumbersAssigned', { count: result.data.assigned }))
      router.refresh()
    } else {
      toast.error(result.error || t('templates.failedSave'))
    }
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <h2 className="text-lg font-semibold">{t('invoice.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {tab === 'customFields' ? t('customFields.description') : t('invoice.description')}
        </p>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-1 rounded-lg border bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab('general')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            tab === 'general'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('invoice.tabs.general')}
        </button>
        {customFieldsEnabled && (
          <button
            type="button"
            onClick={() => setTab('customFields')}
            className={cn(
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              tab === 'customFields'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t('invoice.tabs.customFields')}
          </button>
        )}
      </div>

      {tab === 'general' ? (
        <ReadOnlyWrapper>
          <AppCard icon={FileText} title={t('invoice.tabs.general')} contentClassName="space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">{t('invoice.sectionInvoices')}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invoicePrefix">{t('invoice.invoiceNumberFormat')}</Label>
                  <Input
                    id="invoicePrefix"
                    placeholder="{year}-"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.rich('invoice.invoiceNumberFormatHint', {
                      code: (chunks) => <code className="rounded bg-muted px-1">{chunks}</code>,
                      bold: (chunks) => <span className="font-medium">{chunks}</span>,
                      year: '{year}',
                      preview:
                        invoicePrefix.replace(/\{year\}/g, String(new Date().getFullYear())) +
                        (invoiceStartNumber || '1001'),
                    })}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceStartNumber">{t('invoice.nextInvoiceNumber')}</Label>
                  <Input
                    id="invoiceStartNumber"
                    type="number"
                    min="1"
                    placeholder={t('invoice.nextInvoiceNumberPlaceholder')}
                    value={invoiceStartNumber}
                    onChange={(e) => setInvoiceStartNumber(e.target.value)}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('invoice.nextInvoiceNumberHint', {
                      example: invoicePrefix + (invoiceStartNumber || '...'),
                    })}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDays">{t('invoice.dueDays')}</Label>
                  <Input
                    id="dueDays"
                    type="number"
                    min="0"
                    placeholder="14"
                    value={dueDays}
                    onChange={(e) => setDueDays(e.target.value)}
                    className="w-24"
                  />
                  <p className="text-xs text-muted-foreground">{t('invoice.dueDaysHint')}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="footerNote">{t('invoice.customFooter')}</Label>
                <Textarea
                  id="footerNote"
                  placeholder={t('invoice.footerPlaceholder')}
                  rows={2}
                  value={footerNote}
                  onChange={(e) => setFooterNote(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('invoice.footerHint')}</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">{t('invoice.sectionQuotes')}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quotePrefix">{t('invoice.quoteNumberFormat')}</Label>
                  <Input
                    id="quotePrefix"
                    placeholder="QT-"
                    value={quotePrefix}
                    onChange={(e) => setQuotePrefix(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.rich('invoice.quoteNumberFormatHint', {
                      code: (chunks) => <code className="rounded bg-muted px-1">{chunks}</code>,
                      bold: (chunks) => <span className="font-medium">{chunks}</span>,
                      year: '{year}',
                      preview:
                        quotePrefix.replace(/\{year\}/g, String(new Date().getFullYear())) + '1001',
                    })}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quoteValidDays">{t('invoice.quoteValidDays')}</Label>
                  <Input
                    id="quoteValidDays"
                    type="number"
                    min="0"
                    placeholder="30"
                    value={quoteValidDays}
                    onChange={(e) => setQuoteValidDays(e.target.value)}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">{t('invoice.quoteValidDaysHint')}</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">{t('invoice.sectionCustomers')}</h3>
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  {unnumbered > 0
                    ? t('invoice.assignCustomerNumbersHint', { count: unnumbered })
                    : t('invoice.allCustomersNumbered')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={assigning || unnumbered === 0}
                  onClick={handleAssignCustomerNumbers}
                >
                  {assigning && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {t('invoice.assignCustomerNumbers')}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">{t('invoice.partsMarkupTitle')}</h3>
                <p className="text-xs text-muted-foreground">
                  {t('invoice.partsMarkupDescription')}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="defaultMarkupPercent">{t('invoice.defaultMarkupPercent')}</Label>
                  <Input
                    id="defaultMarkupPercent"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={defaultMarkupPercent}
                    onChange={(e) => setDefaultMarkupPercent(e.target.value)}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('invoice.defaultMarkupPercentHint')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="markupAppliesToInventory"
                    className="flex items-center justify-between gap-3"
                  >
                    <span>{t('invoice.markupAppliesToInventory')}</span>
                    <Switch
                      id="markupAppliesToInventory"
                      checked={markupAppliesToInventory}
                      onCheckedChange={setMarkupAppliesToInventory}
                    />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('invoice.markupAppliesToInventoryHint')}
                  </p>
                </div>
              </div>
            </div>

            <SaveButton>
              <Separator />
              <div className="flex items-center gap-3">
                <Button onClick={handleSaveGeneral} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {t('invoice.saveInvoice')}
                </Button>
              </div>
            </SaveButton>
          </AppCard>
        </ReadOnlyWrapper>
      ) : (
        <CustomFieldsManager
          initialFields={customFields}
          // Which sections a field is placed in is a property of the invoice
          // layout; the designer owns editing it, this only reads it.
          layoutConfig={initialInvoiceLayout ?? getDefaultInvoiceLayout()}
        />
      )}
    </div>
  )
}
