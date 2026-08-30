'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AppCard } from '@/components/app-card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { setSetting } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { templatePresets } from '@/features/settings/Schema/templatePresets'
import { Check, Loader2, Palette, MessageSquare, RotateCcw } from 'lucide-react'
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from '../read-only-guard'
import { cn } from '@/lib/utils'
import { TemplateListClient } from '@/features/inspections/Components/TemplateListClient'
import { Textarea } from '@/components/ui/textarea'
import { InvoiceLayoutPreview } from '@/features/settings/Components/InvoiceLayoutPreview'
import {
  type InvoiceLayoutConfig,
  getDefaultInvoiceLayout,
  getLetterheadMark,
  withLetterheadMark,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import {
  saveInvoiceLayoutConfig,
  saveQuoteLayoutConfig,
} from '@/features/settings/Actions/invoiceLayoutActions'

interface TemplateValues {
  primaryColor: string
  backgroundColor: string
  textColor: string
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

function TemplateTab({
  values,
  setValues,
  documentLabel,
  documentType,
  logoUrl,
  workshop,
  layoutConfig,
  setLayoutConfig,
}: {
  values: TemplateValues
  setValues: (v: TemplateValues) => void
  documentLabel: string
  documentType: 'invoice' | 'quote'
  logoUrl?: string
  workshop?: WorkshopPreviewInfo
  layoutConfig: InvoiceLayoutConfig
  setLayoutConfig: (c: InvoiceLayoutConfig) => void
}) {
  const t = useTranslations('settings')
  const currentPresetId = templatePresets.find(
    (p) =>
      p.primaryColor === values.primaryColor &&
      p.fontFamily === values.fontFamily &&
      p.headerStyle === values.headerStyle
  )?.id

  const applyPreset = (presetId: string) => {
    const preset = templatePresets.find((p) => p.id === presetId)
    if (preset) {
      setValues({
        ...values,
        primaryColor: preset.primaryColor,
        fontFamily: preset.fontFamily,
        headerStyle: preset.headerStyle,
      })
      // Presets that only carry colors leave the arrangement alone, so a
      // workshop can restyle a layout it built itself without losing it.
      if (preset.layoutConfig) setLayoutConfig(preset.layoutConfig)
    }
  }

  return (
    <>
      {/* Template Gallery */}
      <AppCard title={t('templates.presets')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {templatePresets.map((preset) => {
            const isSelected = currentPresetId === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`group relative rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${
                  isSelected ? 'border-primary shadow-sm' : 'border-border hover:border-primary/50'
                }`}
              >
                {isSelected && (
                  <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </div>
                )}

                {/* Mini preview */}
                <div className="mb-2 overflow-hidden rounded border bg-white p-2">
                  <div
                    className="mb-1"
                    style={
                      preset.headerStyle === 'modern'
                        ? {
                            backgroundColor: preset.primaryColor,
                            borderRadius: 2,
                            padding: '3px 4px',
                          }
                        : preset.headerStyle === 'compact'
                          ? {
                              borderBottom: `1px solid #e5e7eb`,
                              paddingBottom: 2,
                            }
                          : {
                              borderBottom: `2px solid ${preset.primaryColor}`,
                              paddingBottom: 2,
                            }
                    }
                  >
                    <div
                      className="text-[6px] font-bold"
                      style={{
                        color: preset.headerStyle === 'modern' ? 'white' : preset.primaryColor,
                        fontFamily: fontMap[preset.fontFamily] || 'sans-serif',
                      }}
                    >
                      Workshop
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="h-1 w-3/4 rounded-full bg-gray-200" />
                    <div className="h-1 w-1/2 rounded-full bg-gray-200" />
                    <div
                      className="mt-1 h-1.5 w-full rounded-sm"
                      style={{ backgroundColor: `${preset.primaryColor}20` }}
                    />
                    <div className="h-1 w-full rounded-full bg-gray-100" />
                    <div className="h-1 w-full rounded-full bg-gray-100" />
                  </div>
                </div>

                <p className="text-xs font-medium">{preset.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {preset.description}
                </p>
              </button>
            )
          })}
        </div>
      </AppCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Colors */}
        <AppCard icon={Palette} title={t('templates.colors')} contentClassName="space-y-2">
          <ColorRow
            label={t('templates.primaryColor')}
            value={values.primaryColor}
            fallback="#d97706"
            onChange={(v) => setValues({ ...values, primaryColor: v })}
          >
            <div className="flex flex-wrap gap-1">
              {colorPresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  title={t('templates.colorPresets.' + preset.key)}
                  onClick={() => setValues({ ...values, primaryColor: preset.value })}
                  style={{ backgroundColor: preset.value }}
                  className={cn(
                    'h-5 w-5 rounded-full ring-offset-1 transition-shadow',
                    values.primaryColor === preset.value && 'ring-2 ring-foreground'
                  )}
                />
              ))}
            </div>
          </ColorRow>

          <ColorRow
            label={t('templates.backgroundColor')}
            value={values.backgroundColor}
            fallback="#ffffff"
            title={t('templates.backgroundColorHint')}
            onChange={(v) => setValues({ ...values, backgroundColor: v })}
            onClear={() => setValues({ ...values, backgroundColor: '' })}
            clearLabel={t('templates.backgroundColorClear')}
          />

          <ColorRow
            label={t('templates.textColor')}
            value={values.textColor}
            fallback="#111827"
            title={t('templates.textColorHint')}
            onChange={(v) => setValues({ ...values, textColor: v })}
            onClear={() => setValues({ ...values, textColor: '' })}
            clearLabel={t('templates.backgroundColorClear')}
          />

          {/* Only the framed sheet has an edge where the frame meets the
              paper, so only it has a line and a shadow to set. */}
          {values.headerStyle === 'framed' && (
            <ColorRow
              label={t('templates.frameBorderColor')}
              value={values.frameBorderColor}
              fallback="#111827"
              title={t('templates.frameBorderColorHint')}
              onChange={(v) => setValues({ ...values, frameBorderColor: v })}
              onClear={() => setValues({ ...values, frameBorderColor: '' })}
              clearLabel={t('templates.backgroundColorClear')}
            />
          )}
        </AppCard>

        {/* Font & Layout Settings */}
        <AppCard title={t('templates.fontAndLayout')} contentClassName="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('templates.fontFamily')}>
              <Select
                value={values.fontFamily}
                onValueChange={(v) => setValues({ ...values, fontFamily: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Helvetica">{t('templates.helveticaDefault')}</SelectItem>
                  <SelectItem value="Times-Roman">{t('templates.timesRoman')}</SelectItem>
                  <SelectItem value="Courier">{t('templates.courier')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label={t('templates.headerStyle')}>
              <Select
                value={values.headerStyle}
                onValueChange={(v) => setValues({ ...values, headerStyle: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">{t('templates.standard')}</SelectItem>
                  <SelectItem value="compact">{t('templates.compact')}</SelectItem>
                  <SelectItem value="modern">{t('templates.modern')}</SelectItem>
                  <SelectItem value="framed">{t('templates.framed')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {/* The framed band carries one mark, so which one it is has to be a
                choice rather than whatever the workshop happens to have
                uploaded. Other header styles show both and need no control. */}
            {values.headerStyle === 'framed' && (
              <Field label={t('templates.letterheadMark')}>
                <Select
                  value={getLetterheadMark(layoutConfig)}
                  onValueChange={(v) =>
                    setLayoutConfig(withLetterheadMark(layoutConfig, v as 'logo' | 'company_name'))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="logo">{t('templates.letterheadLogo')}</SelectItem>
                    <SelectItem value="company_name">
                      {t('templates.letterheadCompanyName')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}

            {values.headerStyle === 'framed' && (
              <Field label={t('templates.frameShadow')}>
                <Select
                  value={values.frameShadow}
                  onValueChange={(v) => setValues({ ...values, frameShadow: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">{t('templates.frameShadowOn')}</SelectItem>
                    <SelectItem value="false">{t('templates.frameShadowOff')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field label={`${t('templates.logoSize')} · ${values.logoSize}%`}>
              <input
                type="range"
                min={50}
                max={200}
                step={10}
                value={values.logoSize}
                onChange={(e) => setValues({ ...values, logoSize: Number(e.target.value) })}
                className="h-8 w-full"
              />
            </Field>
          </div>
        </AppCard>
      </div>

      {/* Preview */}
      <AppCard title={t('templates.preview', { name: documentLabel })}>
        <InvoiceLayoutPreview
          config={layoutConfig}
          documentType={documentType}
          template={values}
          logoUrl={logoUrl}
          workshop={workshop}
        />
      </AppCard>
    </>
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
  const [invoiceLayout, setInvoiceLayout] = useState(
    invoiceLayoutConfig ?? getDefaultInvoiceLayout()
  )
  const [quoteLayout, setQuoteLayout] = useState(quoteLayoutConfig ?? getDefaultInvoiceLayout())
  // A layout is only written back once a preset has rearranged it. Saving a
  // color change must not overwrite an arrangement built in the layout editor.
  const [invoiceLayoutDirty, setInvoiceLayoutDirty] = useState(false)
  const [quoteLayoutDirty, setQuoteLayoutDirty] = useState(false)

  const applyInvoiceLayout = (config: InvoiceLayoutConfig) => {
    setInvoiceLayout(config)
    setInvoiceLayoutDirty(true)
  }

  const applyQuoteLayout = (config: InvoiceLayoutConfig) => {
    setQuoteLayout(config)
    setQuoteLayoutDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (tab === 'invoice') {
        await Promise.all([
          setSetting(SETTING_KEYS.INVOICE_PRIMARY_COLOR, invoiceValues.primaryColor),
          setSetting(SETTING_KEYS.INVOICE_BACKGROUND_COLOR, invoiceValues.backgroundColor),
          setSetting(SETTING_KEYS.INVOICE_TEXT_COLOR, invoiceValues.textColor),
          setSetting(SETTING_KEYS.INVOICE_FRAME_BORDER_COLOR, invoiceValues.frameBorderColor),
          setSetting(SETTING_KEYS.INVOICE_FRAME_SHADOW, invoiceValues.frameShadow),
          setSetting(SETTING_KEYS.INVOICE_FONT_FAMILY, invoiceValues.fontFamily),
          setSetting(SETTING_KEYS.INVOICE_HEADER_STYLE, invoiceValues.headerStyle),
          setSetting(SETTING_KEYS.INVOICE_LOGO_SIZE, String(invoiceValues.logoSize)),
          ...(invoiceLayoutDirty ? [saveInvoiceLayoutConfig(invoiceLayout)] : []),
        ])
        setInvoiceLayoutDirty(false)
        toast.success(t('templates.invoiceTemplateSaved'))
      } else if (tab === 'quotation') {
        await Promise.all([
          setSetting(SETTING_KEYS.QUOTE_PRIMARY_COLOR, quoteValues.primaryColor),
          setSetting(SETTING_KEYS.QUOTE_BACKGROUND_COLOR, quoteValues.backgroundColor),
          setSetting(SETTING_KEYS.QUOTE_TEXT_COLOR, quoteValues.textColor),
          setSetting(SETTING_KEYS.QUOTE_FRAME_BORDER_COLOR, quoteValues.frameBorderColor),
          setSetting(SETTING_KEYS.QUOTE_FRAME_SHADOW, quoteValues.frameShadow),
          setSetting(SETTING_KEYS.QUOTE_FONT_FAMILY, quoteValues.fontFamily),
          setSetting(SETTING_KEYS.QUOTE_HEADER_STYLE, quoteValues.headerStyle),
          setSetting(SETTING_KEYS.QUOTE_LOGO_SIZE, String(quoteValues.logoSize)),
          ...(quoteLayoutDirty ? [saveQuoteLayoutConfig(quoteLayout)] : []),
        ])
        setQuoteLayoutDirty(false)
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
        <h2 className="text-lg font-semibold">{t('templates.title')}</h2>
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
              <TemplateTab
                values={invoiceValues}
                setValues={setInvoiceValues}
                documentLabel={t('templates.tabs.invoice')}
                documentType="invoice"
                logoUrl={logoUrl}
                workshop={workshop}
                layoutConfig={invoiceLayout}
                setLayoutConfig={applyInvoiceLayout}
              />
            ) : (
              <TemplateTab
                values={quoteValues}
                setValues={setQuoteValues}
                documentLabel={t('templates.tabs.quotation')}
                documentType="quote"
                logoUrl={logoUrl}
                workshop={workshop}
                layoutConfig={quoteLayout}
                setLayoutConfig={applyQuoteLayout}
              />
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
