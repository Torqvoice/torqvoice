'use client'

import { AppCard } from '@/components/app-card'
import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { freezeUnfrozenInvoices } from '@/features/invoices/Actions/legacyInvoiceActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { ChevronDown, ChevronUp, FileText, Hash, Loader2, Lock, Save } from 'lucide-react'
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
  defaultValue: string | null
  required: boolean
  sortOrder: number
  isActive: boolean
}

interface InvoiceSettingsProps {
  settings: Record<string, string>
  /** Fills the layout preview with this workshop's own letterhead. */
  workshop?: { name?: string; address?: string; phone?: string; email?: string; slogan?: string }
  /** Invoices that reached a customer before issuing existed, still unfrozen. */
  unfrozenInvoices?: number
  initialInvoiceLayout?: InvoiceLayoutConfig
  initialQuoteLayout?: InvoiceLayoutConfig
  customFields: FieldDef[]
  customFieldsEnabled: boolean
  telegramEnabled?: boolean
}

/** One labelled control with its one-line explanation beneath. */
function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** A switch with its name and explanation on the left, the way the tax page does it. */
function SwitchRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
    </div>
  )
}

export function InvoiceSettings({
  settings,
  unfrozenInvoices = 0,
  initialInvoiceLayout,
  initialQuoteLayout,
  customFields,
  customFieldsEnabled,
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
  const [invoiceLockEnabled, setInvoiceLockEnabled] = useState(
    settings[SETTING_KEYS.INVOICE_LOCK_ENABLED] === 'true'
  )
  const [invoiceLockTrigger, setInvoiceLockTrigger] = useState(
    settings[SETTING_KEYS.INVOICE_LOCK_TRIGGER] || 'paid'
  )
  const [quoteLockEnabled, setQuoteLockEnabled] = useState(
    settings[SETTING_KEYS.QUOTE_LOCK_ENABLED] === 'true'
  )
  const [quoteLockTrigger, setQuoteLockTrigger] = useState(
    settings[SETTING_KEYS.QUOTE_LOCK_TRIGGER] || 'accepted'
  )
  const [attachPdf, setAttachPdf] = useState(settings[SETTING_KEYS.EMAIL_ATTACH_PDF] !== 'false')
  // The three paragraphs on what a lock freezes are worth reading once, not
  // every time somebody comes to change a due date. Folded away by default.
  const [lockDetailsOpen, setLockDetailsOpen] = useState(false)

  const handleSaveGeneral = async () => {
    setSaving(true)
    await setSettings({
      [SETTING_KEYS.INVOICE_PREFIX]: invoicePrefix,
      [SETTING_KEYS.QUOTE_PREFIX]: quotePrefix,
      [SETTING_KEYS.QUOTE_VALID_DAYS]: quoteValidDays,
      [SETTING_KEYS.INVOICE_START_NUMBER]: invoiceStartNumber,
      [SETTING_KEYS.INVOICE_DUE_DAYS]: dueDays,
      [SETTING_KEYS.INVOICE_FOOTER_NOTE]: footerNote,
      [SETTING_KEYS.INVOICE_LOCK_ENABLED]: invoiceLockEnabled ? 'true' : 'false',
      [SETTING_KEYS.INVOICE_LOCK_TRIGGER]: invoiceLockTrigger,
      [SETTING_KEYS.QUOTE_LOCK_ENABLED]: quoteLockEnabled ? 'true' : 'false',
      [SETTING_KEYS.QUOTE_LOCK_TRIGGER]: quoteLockTrigger,
      [SETTING_KEYS.EMAIL_ATTACH_PDF]: attachPdf ? 'true' : 'false',
    })
    setSaving(false)
    router.refresh()
    toast.success(t('invoice.saved'))
  }

  const confirm = useConfirm()

  // Invoices sent before this version could lock what they print. Locked in
  // batches, one request each, so a workshop with thousands of them sees
  // progress rather than a timeout.
  const [unfrozen, setUnfrozen] = useState(unfrozenInvoices)
  const [freezing, setFreezing] = useState<{ done: number; total: number } | null>(null)
  const handleFreezeInvoices = async () => {
    const total = unfrozen
    const ok = await confirm({
      title: t('invoice.freezeConfirmTitle', { count: total }),
      description: t('invoice.freezeConfirmBody'),
      confirmLabel: t('invoice.freezeButton'),
    })
    if (!ok) return
    setFreezing({ done: 0, total })
    let done = 0
    try {
      let remaining = total
      while (remaining > 0) {
        const result = await freezeUnfrozenInvoices()
        if (!result.success || !result.data) throw new Error(result.success ? '' : result.error)
        done += result.data.frozen
        remaining = result.data.remaining
        setFreezing({ done, total })
        // A batch that locked nothing yet left some behind would loop forever.
        if (result.data.frozen === 0) break
      }
      setUnfrozen(remaining)
      toast.success(t('invoice.freezeDone', { count: done }))
      router.refresh()
    } catch {
      setUnfrozen(Math.max(0, total - done))
      toast.error(t('invoice.freezeFailed'))
    } finally {
      setFreezing(null)
    }
  }

  const year = String(new Date().getFullYear())
  const numberHint = (prefix: string, preview: string) =>
    t.rich('invoice.invoiceNumberFormatHint', {
      code: (chunks) => <code className="rounded bg-muted px-1">{chunks}</code>,
      bold: (chunks) => <span className="font-medium">{chunks}</span>,
      year: '{year}',
      preview: prefix.replace(/\{year\}/g, year) + preview,
    })

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <h2 className="text-lg font-semibold">{t('invoice.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {tab === 'customFields' ? t('customFields.description') : t('invoice.description')}
        </p>
      </div>

      {customFieldsEnabled && (
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
        </div>
      )}

      {tab === 'general' ? (
        <ReadOnlyWrapper>
          <div className="space-y-6">
            <AppCard
              icon={Hash}
              title={t('invoice.numberingTitle')}
              description={t('invoice.numberingDescription')}
            >
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">{t('invoice.sectionInvoices')}</h3>
                  <Field
                    id="invoicePrefix"
                    label={t('invoice.invoiceNumberFormat')}
                    hint={numberHint(invoicePrefix, invoiceStartNumber || '1001')}
                  >
                    <Input
                      id="invoicePrefix"
                      placeholder="{year}-"
                      value={invoicePrefix}
                      onChange={(e) => setInvoicePrefix(e.target.value)}
                    />
                  </Field>
                  <Field
                    id="invoiceStartNumber"
                    label={t('invoice.nextInvoiceNumber')}
                    hint={t('invoice.nextInvoiceNumberHint', {
                      example: invoicePrefix + (invoiceStartNumber || '...'),
                    })}
                  >
                    <Input
                      id="invoiceStartNumber"
                      type="number"
                      min="1"
                      placeholder={t('invoice.nextInvoiceNumberPlaceholder')}
                      value={invoiceStartNumber}
                      onChange={(e) => setInvoiceStartNumber(e.target.value)}
                      className="w-32"
                    />
                  </Field>
                  <Field id="dueDays" label={t('invoice.dueDays')} hint={t('invoice.dueDaysHint')}>
                    <Input
                      id="dueDays"
                      type="number"
                      min="0"
                      placeholder="14"
                      value={dueDays}
                      onChange={(e) => setDueDays(e.target.value)}
                      className="w-24"
                    />
                  </Field>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">{t('invoice.sectionQuotes')}</h3>
                  <Field
                    id="quotePrefix"
                    label={t('invoice.quoteNumberFormat')}
                    hint={numberHint(quotePrefix, '1001')}
                  >
                    <Input
                      id="quotePrefix"
                      placeholder="QT-"
                      value={quotePrefix}
                      onChange={(e) => setQuotePrefix(e.target.value)}
                    />
                  </Field>
                  <Field
                    id="quoteValidDays"
                    label={t('invoice.quoteValidDays')}
                    hint={t('invoice.quoteValidDaysHint')}
                  >
                    <Input
                      id="quoteValidDays"
                      type="number"
                      min="0"
                      placeholder="30"
                      value={quoteValidDays}
                      onChange={(e) => setQuoteValidDays(e.target.value)}
                      className="w-24"
                    />
                  </Field>
                </div>
              </div>
            </AppCard>

            <AppCard
              icon={FileText}
              title={t('invoice.documentsTitle')}
              description={t('invoice.documentsDescription')}
              contentClassName="space-y-5"
            >
              <Field
                id="footerNote"
                label={t('invoice.customFooter')}
                hint={t('invoice.footerHint')}
              >
                <Textarea
                  id="footerNote"
                  placeholder={t('invoice.footerPlaceholder')}
                  rows={2}
                  value={footerNote}
                  onChange={(e) => setFooterNote(e.target.value)}
                />
              </Field>
              <SwitchRow
                id="attachPdf"
                label={t('invoice.attachPdfLabel')}
                hint={t('invoice.attachPdfHint')}
                checked={attachPdf}
                onCheckedChange={setAttachPdf}
              />
            </AppCard>

            <AppCard
              icon={Lock}
              title={t('invoice.lockTitle')}
              description={t('invoice.lockDescription')}
              contentClassName="space-y-5"
              footer={unfrozen === 0 ? t('invoice.freezeNone') : undefined}
            >
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="invoiceLockEnabled"
                    className="flex items-center justify-between gap-3"
                  >
                    <span>{t('invoice.lockInvoicesLabel')}</span>
                    <Switch
                      id="invoiceLockEnabled"
                      checked={invoiceLockEnabled}
                      onCheckedChange={setInvoiceLockEnabled}
                    />
                  </Label>
                  <Select
                    value={invoiceLockTrigger}
                    onValueChange={setInvoiceLockTrigger}
                    disabled={!invoiceLockEnabled}
                  >
                    <SelectTrigger id="invoiceLockTrigger" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sent">{t('invoice.lockTriggerSent')}</SelectItem>
                      <SelectItem value="paid">{t('invoice.lockTriggerPaid')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {invoiceLockTrigger === 'sent'
                      ? t('invoice.lockTriggerSentHint')
                      : t('invoice.lockTriggerPaidHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="quoteLockEnabled"
                    className="flex items-center justify-between gap-3"
                  >
                    <span>{t('invoice.lockQuotesLabel')}</span>
                    <Switch
                      id="quoteLockEnabled"
                      checked={quoteLockEnabled}
                      onCheckedChange={setQuoteLockEnabled}
                    />
                  </Label>
                  <Select
                    value={quoteLockTrigger}
                    onValueChange={setQuoteLockTrigger}
                    disabled={!quoteLockEnabled}
                  >
                    <SelectTrigger id="quoteLockTrigger" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sent">{t('invoice.quoteLockTriggerSent')}</SelectItem>
                      <SelectItem value="accepted">
                        {t('invoice.quoteLockTriggerAccepted')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {quoteLockTrigger === 'sent'
                      ? t('invoice.quoteLockTriggerSentHint')
                      : t('invoice.quoteLockTriggerAcceptedHint')}
                  </p>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setLockDetailsOpen((open) => !open)}
                  aria-expanded={lockDetailsOpen}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {lockDetailsOpen ? t('invoice.lockDetailsHide') : t('invoice.lockDetailsShow')}
                  {lockDetailsOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
                {lockDetailsOpen && (
                  <div className="mt-2 space-y-1.5 rounded-md border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
                    <p>{t('invoice.lockWhatItDoes')}</p>
                    <p>{t('invoice.lockWhatItAllows')}</p>
                    <p>{t('invoice.lockUnlockNote')}</p>
                  </div>
                )}
              </div>

              {unfrozen > 0 && (
                <div className="rounded-md border p-3">
                  <h4 className="text-sm font-medium">{t('invoice.freezeTitle')}</h4>
                  <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t('invoice.freezeBody', { count: unfrozen })}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={freezing !== null}
                      onClick={handleFreezeInvoices}
                    >
                      {freezing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      {freezing
                        ? t('invoice.freezeProgress', {
                            done: freezing.done,
                            total: freezing.total,
                          })
                        : t('invoice.freezeButton')}
                    </Button>
                  </div>
                </div>
              )}
            </AppCard>

            <SaveButton>
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
          </div>
        </ReadOnlyWrapper>
      ) : (
        <CustomFieldsManager
          initialFields={customFields}
          layoutConfig={initialInvoiceLayout ?? getDefaultInvoiceLayout()}
          quoteLayoutConfig={initialQuoteLayout ?? getDefaultInvoiceLayout()}
        />
      )}
    </div>
  )
}
