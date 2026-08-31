'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AppCard } from '@/components/app-card'
import { toast } from 'sonner'
import { setSetting } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { layoutPresets } from '@/features/settings/Schema/layoutPresets'
import { Loader2, Palette, MessageSquare, RotateCcw } from 'lucide-react'
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from '../read-only-guard'
import { cn } from '@/lib/utils'
import { TemplateListClient } from '@/features/inspections/Components/TemplateListClient'
import { PresetPreview } from '@/features/invoice-designer/Components/PresetPreview'
import { Textarea } from '@/components/ui/textarea'
import { type InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'

interface TemplateValues {
  primaryColor: string
  backgroundColor: string
  textColor: string
  companyTextColor: string
  frameBorderColor: string
  frameShadow: string
  fontFamily: string
  headerStyle: string
  logoSize: number
}

type TabType = 'invoice' | 'quotation' | 'inspections' | 'sms'

interface WorkshopPreviewInfo {
  name?: string
  address?: string
  phone?: string
  email?: string
  slogan?: string
}

const fontMap: Record<string, string> = {
  Helvetica: 'Helvetica, Arial, sans-serif',
  'Times-Roman': "'Times New Roman', Times, serif",
  Courier: "'Courier New', Courier, monospace",
}

const colorPresets = [
  { key: 'amber', value: '#d97706' },
  { key: 'blue', value: '#2563eb' },
  { key: 'emerald', value: '#059669' },
  { key: 'red', value: '#dc2626' },
  { key: 'purple', value: '#7c3aed' },
  { key: 'slate', value: '#475569' },
  { key: 'rose', value: '#e11d48' },
  { key: 'indigo', value: '#4f46e5' },
]

/** A label above a control, at the density the rest of the app uses. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

/**
 * One color on one line: swatch, hex, and whatever the row needs after it.
 * Empty means "not chosen", which is why the swatch falls back for display
 * only and the hex field is left blank rather than filled in with the default.
 */
function ColorRow({
  label,
  value,
  fallback,
  title,
  onChange,
  onClear,
  clearLabel,
  children,
}: {
  label: string
  value: string
  fallback: string
  title?: string
  onChange: (value: string) => void
  onClear?: () => void
  clearLabel?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <Label className="w-24 shrink-0 text-xs text-muted-foreground">{label}</Label>
      <Input
        type="color"
        value={value || fallback}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 shrink-0 cursor-pointer p-0.5"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fallback}
        className="h-7 w-24 shrink-0 font-mono text-xs"
      />
      {onClear && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onClear}
          disabled={!value}
        >
          {clearLabel}
        </Button>
      )}
      {children}
    </div>
  )
}

/**
 * The invoice and quotation tabs are a way in to the designer now, not a place
 * to style anything. Everything about how a document looks lives on one page
 * with the sheet in front of you, rather than split across a colour form here
 * and an arrangement editor two clicks away.
 */
function TemplateTab({
  documentType,
  workshop,
  logoUrl,
}: {
  documentType: 'invoice' | 'quote'
  workshop?: WorkshopPreviewInfo
  logoUrl?: string
}) {
  const t = useTranslations('settings')

  return (
    <AppCard icon={Palette} title={t('templates.presets')} contentClassName="space-y-4">
      <p className="text-sm text-muted-foreground">{t('templates.designerIntro')}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {layoutPresets.map((preset) => (
          <Link
            key={preset.id}
            href={`/invoice-designer?doc=${documentType}&preset=${preset.id}`}
            target="_blank"
            rel="noopener"
            className="rounded-lg border p-3 text-left transition-colors hover:bg-muted"
          >
            {/* The sheet this template actually produces, on this workshop's
                own details — the same picture the designer's gallery draws. */}
            <div className="flex justify-center">
              <PresetPreview
                preset={preset}
                docType={documentType}
                workshop={workshop}
                logoUrl={logoUrl}
              />
            </div>
            <p className="mt-2 text-xs font-medium">
              {t(`layoutEditor.presets.${preset.id}.name` as Parameters<typeof t>[0])}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">
              {t(`layoutEditor.presets.${preset.id}.description` as Parameters<typeof t>[0])}
            </p>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <p className="text-xs text-muted-foreground">{t('templates.designerHint')}</p>
        <Button asChild variant="outline">
          <Link href={`/invoice-designer?doc=${documentType}`} target="_blank" rel="noopener">
            {t('templates.openDesigner')} →
          </Link>
        </Button>
      </div>
    </AppCard>
  )
}

const smsTemplateFields = [
  {
    key: SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY,
    labelKey: 'invoiceReady',
    descriptionKey: 'invoiceReadyDescription',
    defaultKey: 'invoiceReady',
    variables: ['{share_link}', '{company_name}', '{customer_name}', '{current_user}'],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY,
    labelKey: 'quoteReady',
    descriptionKey: 'quoteReadyDescription',
    defaultKey: 'quoteReady',
    variables: ['{share_link}', '{company_name}', '{customer_name}', '{current_user}'],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY,
    labelKey: 'inspectionReady',
    descriptionKey: 'inspectionReadyDescription',
    defaultKey: 'inspectionReady',
    variables: ['{share_link}', '{company_name}', '{customer_name}', '{current_user}'],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS,
    labelKey: 'statusInProgress',
    descriptionKey: 'statusInProgressDescription',
    defaultKey: 'statusInProgress',
    variables: ['{company_name}', '{customer_name}', '{current_user}', '{vehicle}'],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS,
    labelKey: 'statusWaitingParts',
    descriptionKey: 'statusWaitingPartsDescription',
    defaultKey: 'statusWaitingParts',
    variables: ['{company_name}', '{customer_name}', '{current_user}', '{vehicle}'],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_READY,
    labelKey: 'statusReady',
    descriptionKey: 'statusReadyDescription',
    defaultKey: 'statusReady',
    variables: ['{company_name}', '{customer_name}', '{current_user}', '{vehicle}'],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED,
    labelKey: 'statusCompleted',
    descriptionKey: 'statusCompletedDescription',
    defaultKey: 'statusCompleted',
    variables: ['{company_name}', '{customer_name}', '{current_user}', '{vehicle}'],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED,
    labelKey: 'paymentReceived',
    descriptionKey: 'paymentReceivedDescription',
    defaultKey: 'paymentReceived',
    variables: [
      '{amount}',
      '{invoice_number}',
      '{company_name}',
      '{customer_name}',
      '{current_user}',
    ],
  },
]

function SmsTemplateTab({
  values,
  setValues,
}: {
  values: Record<string, string>
  setValues: (v: Record<string, string>) => void
}) {
  const t = useTranslations('settings')
  const handleReset = (key: string) => {
    const field = smsTemplateFields.find((f) => f.key === key)
    const defaultVal = field ? t.raw(`templates.smsDefaults.${field.defaultKey}`) : ''
    setValues({ ...values, [key]: defaultVal })
  }

  return (
    <div className="space-y-4">
      <AppCard icon={MessageSquare} title={t('templates.smsTemplates')}>
        <p className="mb-4 text-sm text-muted-foreground">
          {t.rich('templates.smsTemplatesDescription', {
            code: (chunks) => (
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </p>
        <div className="space-y-6">
          {smsTemplateFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{t('templates.' + field.labelKey)}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => handleReset(field.key)}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  {t('templates.reset')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('templates.' + field.descriptionKey)}
              </p>
              <Textarea
                value={values[field.key] || ''}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                rows={2}
                className="resize-none font-mono text-sm"
              />
              <div className="flex flex-wrap gap-1">
                {field.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(v)
                      toast.success(`Copied ${v}`)
                    }}
                    className="cursor-pointer rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
                    title={`Click to copy ${v}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </AppCard>
    </div>
  )
}

interface InspectionTemplateItem {
  id: string
  name: string
  description?: string | null
  code?: string | null
  sortOrder: number
  inputType?: string | null
  unit?: string | null
  minValue?: number | null
  maxValue?: number | null
  choices?: string[]
  required?: boolean
  photoRequired?: boolean
  defaultSeverity?: string | null
  defectSuggestions?: string[]
}

interface InspectionTemplateSection {
  id: string
  name: string
  description?: string | null
  code?: string | null
  sortOrder: number
  items: InspectionTemplateItem[]
}

interface InspectionTemplate {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  country?: string | null
  standard?: string | null
  severityScale?: string | null
  sections: InspectionTemplateSection[]
}

export function TemplateSettings({
  initialInvoiceValues,
  initialQuoteValues,
  inspectionTemplates = [],
  smsEnabled = false,
  initialSmsTemplates = {},
  logoUrl,
  workshop,
  invoiceLayoutConfig,
  quoteLayoutConfig,
}: {
  initialInvoiceValues: TemplateValues
  initialQuoteValues: TemplateValues
  inspectionTemplates?: InspectionTemplate[]
  smsEnabled?: boolean
  initialSmsTemplates?: Record<string, string>
  logoUrl?: string
  workshop?: WorkshopPreviewInfo
  invoiceLayoutConfig?: InvoiceLayoutConfig
  quoteLayoutConfig?: InvoiceLayoutConfig
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('settings')

  const tab = (searchParams.get('tab') as TabType) || 'invoice'
  const setTab = useCallback(
    (newTab: TabType) => {
      const params = new URLSearchParams(searchParams.toString())
      if (newTab === 'invoice') {
        params.delete('tab')
      } else {
        params.set('tab', newTab)
      }
      const qs = params.toString()
      router.replace(`/settings/templates${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [router, searchParams]
  )
  const [saving, setSaving] = useState(false)
  const [invoiceValues, setInvoiceValues] = useState(initialInvoiceValues)
  const [quoteValues, setQuoteValues] = useState(initialQuoteValues)
  const [smsValues, setSmsValues] = useState<Record<string, string>>(initialSmsTemplates)

  const handleSave = async () => {
    setSaving(true)
    try {
      if (tab === 'invoice') {
        await Promise.all([
          setSetting(SETTING_KEYS.INVOICE_PRIMARY_COLOR, invoiceValues.primaryColor),
          setSetting(SETTING_KEYS.INVOICE_BACKGROUND_COLOR, invoiceValues.backgroundColor),
          setSetting(SETTING_KEYS.INVOICE_TEXT_COLOR, invoiceValues.textColor),
          setSetting(SETTING_KEYS.INVOICE_COMPANY_TEXT_COLOR, invoiceValues.companyTextColor),
          setSetting(SETTING_KEYS.INVOICE_FRAME_BORDER_COLOR, invoiceValues.frameBorderColor),
          setSetting(SETTING_KEYS.INVOICE_FRAME_SHADOW, invoiceValues.frameShadow),
          setSetting(SETTING_KEYS.INVOICE_FONT_FAMILY, invoiceValues.fontFamily),
          setSetting(SETTING_KEYS.INVOICE_HEADER_STYLE, invoiceValues.headerStyle),
          setSetting(SETTING_KEYS.INVOICE_LOGO_SIZE, String(invoiceValues.logoSize)),
        ])
        toast.success(t('templates.invoiceTemplateSaved'))
      } else if (tab === 'quotation') {
        await Promise.all([
          setSetting(SETTING_KEYS.QUOTE_PRIMARY_COLOR, quoteValues.primaryColor),
          setSetting(SETTING_KEYS.QUOTE_BACKGROUND_COLOR, quoteValues.backgroundColor),
          setSetting(SETTING_KEYS.QUOTE_TEXT_COLOR, quoteValues.textColor),
          setSetting(SETTING_KEYS.QUOTE_COMPANY_TEXT_COLOR, quoteValues.companyTextColor),
          setSetting(SETTING_KEYS.QUOTE_FRAME_BORDER_COLOR, quoteValues.frameBorderColor),
          setSetting(SETTING_KEYS.QUOTE_FRAME_SHADOW, quoteValues.frameShadow),
          setSetting(SETTING_KEYS.QUOTE_FONT_FAMILY, quoteValues.fontFamily),
          setSetting(SETTING_KEYS.QUOTE_HEADER_STYLE, quoteValues.headerStyle),
          setSetting(SETTING_KEYS.QUOTE_LOGO_SIZE, String(quoteValues.logoSize)),
        ])
        toast.success(t('templates.quotationTemplateSaved'))
      } else if (tab === 'sms') {
        await Promise.all(
          Object.entries(smsValues).map(([key, value]) =>
            setSetting(key as Parameters<typeof setSetting>[0], value)
          )
        )
        toast.success(t('templates.smsTemplateSaved'))
      }
    } catch {
      toast.error(t('templates.failedSave'))
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('templates.title')}</h2>
          {/* Colors live here and arrangement lives there, which is easy to
              get lost in. Each page says where the other half is. */}
          {tab !== 'inspections' && tab !== 'sms' && (
            <Link
              href="/settings/invoice?tab=layout"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t('templates.goToLayout')}
            </Link>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {tab === 'inspections'
            ? t('templates.inspectionsDescription')
            : tab === 'sms'
              ? t('templates.smsDescription')
              : t('templates.invoiceDescription')}
        </p>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-1 rounded-lg border bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab('invoice')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            tab === 'invoice'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('templates.tabs.invoice')}
        </button>
        <button
          type="button"
          onClick={() => setTab('quotation')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            tab === 'quotation'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('templates.tabs.quotation')}
        </button>
        <button
          type="button"
          onClick={() => setTab('inspections')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            tab === 'inspections'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('templates.tabs.inspections')}
        </button>
        {smsEnabled && (
          <button
            type="button"
            onClick={() => setTab('sms')}
            className={cn(
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              tab === 'sms'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t('templates.tabs.sms')}
          </button>
        )}
      </div>

      {tab === 'inspections' ? (
        <TemplateListClient templates={inspectionTemplates} />
      ) : tab === 'sms' ? (
        <>
          <ReadOnlyWrapper>
            <SmsTemplateTab values={smsValues} setValues={setSmsValues} />
          </ReadOnlyWrapper>
          <SaveButton>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('templates.saveSmsTemplates')}
              </Button>
            </div>
          </SaveButton>
        </>
      ) : (
        <>
          <ReadOnlyWrapper>
            {tab === 'invoice' ? (
              <TemplateTab documentType="invoice" workshop={workshop} logoUrl={logoUrl} />
            ) : (
              <TemplateTab documentType="quote" workshop={workshop} logoUrl={logoUrl} />
            )}
          </ReadOnlyWrapper>

          <SaveButton>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t(
                  tab === 'invoice'
                    ? 'templates.saveInvoiceTemplate'
                    : 'templates.saveQuotationTemplate'
                )}
              </Button>
            </div>
          </SaveButton>
        </>
      )}
    </div>
  )
}
