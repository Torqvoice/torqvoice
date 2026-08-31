'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type {
  InvoiceDocumentStyle,
  InvoiceLayoutConfig,
  InvoiceSection,
  InvoiceSectionStyle,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import {
  BOXED_ELIGIBLE_SECTIONS,
  COLUMN_ELIGIBLE_SECTIONS,
  SECTIONS_WITH_FIELDS,
  fromCustomFieldId,
  getBuiltinFieldName,
  getBuiltinFieldsForSection,
  isCustomFieldId,
  toCustomFieldId,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { BASE_FONT_SIZE } from '@/features/vehicles/Components/invoice-pdf/styles'
import { FONT_OPTIONS, fontStack } from './types'
import type { DesignerTemplate } from './types'

/** Sections whose body is a table, and so offer line controls. */
const TABLE_SECTIONS = new Set(['items_table', 'parts_table', 'labor_table', 'findings'])

/** Sections that print a small heading of their own, which can be hidden. */
const HEADED_SECTIONS = new Set([
  'customer',
  'vehicle',
  'service',
  'general',
  'notes',
  'warranty',
  'bank_account',
  'parts_table',
  'labor_table',
  'findings',
])

const SWATCHES = [
  '#d97706',
  '#2563eb',
  '#059669',
  '#dc2626',
  '#7c3aed',
  '#475569',
  '#e11d48',
  '#ee7623',
]

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-[#eceef1] pt-2">
      <div className="pb-2 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-[#8a8f97]">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] font-medium">{label}</span>
      {children}
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
      style={{ background: on ? '#2563eb' : '#d7dade' }}
    >
      <span
        className="absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all"
        style={{ left: on ? 19 : 3 }}
      />
    </button>
  )
}

/** A color with its hex beside it, and a clear when the value is optional. */
function Color({
  label,
  value,
  fallback,
  onChange,
  clearable = true,
}: {
  label: string
  value: string
  fallback: string
  onChange: (value: string) => void
  clearable?: boolean
}) {
  const t = useTranslations('settings.designer')
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="color"
        value={value || fallback}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] w-[34px] cursor-pointer rounded-md border border-[#e3e5e9] bg-white p-0.5"
      />
      <span className="flex-1 text-[13px] font-medium">{label}</span>
      <span className="font-mono text-[11px] text-[#8a8f97]">{value || t('auto')}</span>
      {clearable && (
        <button
          type="button"
          onClick={() => onChange('')}
          disabled={!value}
          className="text-[13px] text-[#8a8f97] hover:text-[#1a1d21] disabled:opacity-30"
        >
          ×
        </button>
      )}
    </div>
  )
}

/**
 * Give this document a mark of its own, without leaving the designer.
 *
 * A workshop's paperwork does not always want the badge the app wears: a
 * wider version for a letterhead, or one with the address set into it. So
 * what is uploaded here belongs to this document, and the company logo is
 * what prints until something is. Changing it here never touches the picture
 * in the sidebar, which is the surprise this exists to avoid.
 *
 * Put where the logo is being looked at, because somebody adjusting the
 * letterhead can see the file is wrong precisely because it is in front of
 * them, and sending them to another screen loses the layout in progress.
 */
function LogoUpload({
  value,
  own,
  onChange,
}: {
  value: string
  own: boolean
  onChange: (url: string) => void
}) {
  const t = useTranslations('settings.designer')
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const upload = async (file: File) => {
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/protected/upload/logo', { method: 'POST', body })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        toast.error(error.error || t('logoFailed'))
        return
      }
      const { url } = await res.json()
      onChange(url)
    } catch {
      toast.error(t('logoFailed'))
    } finally {
      setBusy(false)
      // Cleared so choosing the same file again still fires a change.
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-[#e3e5e9] bg-white">
          {value ? (
            // Not next/image: an uploaded URL the loader cannot size.
            <img src={value} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[15px] text-[#c3c7cd]">◫</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex-1 rounded-[6px] border border-[#d7dade] bg-white px-2 py-1.5 text-[12.5px] font-medium hover:bg-[#f6f7f8] disabled:opacity-60"
          >
            {busy ? t('logoUploading') : value ? t('logoReplace') : t('logoUpload')}
          </button>
          {/* Clearing this document's own mark returns it to the company
              logo; it never deletes the company logo itself, which belongs
              to the app rather than to any sheet. */}
          {own && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange('')}
              className="rounded-[6px] border border-[#d7dade] bg-white px-2 py-1.5 text-[12.5px] text-[#8a8f97] hover:text-[#dc2626] disabled:opacity-60"
            >
              {t('logoReset')}
            </button>
          )}
        </div>
      </div>
      <p className="text-[11.5px] leading-snug text-[#8a8f97]">
        {own ? t('logoOwn') : t('logoInherited')}
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
      />
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  suffix: string
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px] font-medium">
        <span>{label}</span>
        <span className="font-normal text-[#8a8f97]">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#2563eb]"
      />
    </div>
  )
}

function Choice({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex gap-0.5 rounded-md bg-[#f0f1f4] p-[3px]">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className="flex-1 rounded-[5px] py-1.5 text-[12.5px] transition-colors"
          style={{
            background: value === option.value ? '#fff' : 'transparent',
            fontWeight: value === option.value ? 600 : 400,
            boxShadow: value === option.value ? '0 1px 2px rgba(26,29,33,0.08)' : undefined,
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const HEADER_STYLES = ['standard', 'compact', 'modern', 'framed']

export interface DesignerFieldDef {
  id: string
  label: string
  name: string
  isActive: boolean
}

export function DesignerInspector({
  layout,
  template,
  customFields,
  selected,
  onSelect,
  onSection,
  onPlaceInFlow,
  onSectionStyle,
  onDocument,
  onTemplate,
  logoUrl,
  ownLogo,
  onLogo,
  sloganSet,
}: {
  layout: InvoiceLayoutConfig
  template: DesignerTemplate
  customFields: DesignerFieldDef[]
  selected: string | null
  onSelect: (id: string | null) => void
  onSection: (id: string, patch: Partial<InvoiceSection>) => void
  /** Puts a block in the flow, in a column, discarding any hand placement. */
  onPlaceInFlow: (id: string, column: 'left' | 'right' | undefined) => void
  onSectionStyle: (id: string, style: InvoiceSectionStyle | undefined) => void
  onDocument: (patch: InvoiceDocumentStyle) => void
  onTemplate: (patch: Partial<DesignerTemplate>) => void
  /** The picture this document will print, whichever it comes from. */
  logoUrl: string
  /** Whether that picture is this document's own rather than the company's. */
  ownLogo: boolean
  onLogo: (url: string) => void
  /** Whether the workshop has a slogan, or the canvas is showing a stand-in. */
  sloganSet: boolean
}) {
  const t = useTranslations('settings.designer')
  const tSection = useTranslations('settings.layoutEditor.sections')
  const tField = useTranslations('settings.layoutEditor.fields')
  /** A field's name, whether it is one of ours or one the workshop defined. */
  const fieldName = (fieldId: string) => {
    if (!isCustomFieldId(fieldId)) {
      return tField.has(fieldId) ? tField(fieldId) : (getBuiltinFieldName(fieldId) ?? fieldId)
    }
    const definition = customFields.find((f) => f.id === fromCustomFieldId(fieldId))
    return definition?.label ?? definition?.name ?? fieldId
  }
  /** A section's name, or its id spaced out when nothing has named it. */
  const sectionName = (id: string) => (tSection.has(id) ? tSection(id) : id.replace(/_/g, ' '))
  const section = selected ? layout.sections.find((s) => s.id === selected) : undefined
  const doc = layout.document ?? {}

  if (section) {
    const style = section.style ?? {}
    const assigned = new Set(
      layout.sections.flatMap((s) =>
        (s.fields ?? []).filter((f) => isCustomFieldId(f.id)).map((f) => fromCustomFieldId(f.id))
      )
    )
    const unassignedCustomFields = customFields.filter((f) => f.isActive && !assigned.has(f.id))
    /**
     * The fields this section shows, resolved the way the generator resolves
     * them: no list of its own means every built-in field, visible.
     */
    const builtins = getBuiltinFieldsForSection(section.id)
    const builtinIds = new Set(builtins.map((f) => f.id))
    const stored = (section.fields ?? builtins.map((f) => ({ id: f.id, visible: true }))) // A stored id no builtin list carries any more is a leftover, not a field.
      .filter((f) => isCustomFieldId(f.id) || builtinIds.has(f.id))
    // A field added after this layout was written still needs its switch.
    // Without this a saved design, which is loaded as it was stored, can never
    // reach anything built since, and the option looks simply missing.
    const resolvedFields = [
      ...stored,
      ...builtins
        .filter((f) => !stored.some((existing) => existing.id === f.id))
        .map((f) => ({ id: f.id, visible: false })),
    ]
    const setFields = (fields: { id: string; visible: boolean }[]) =>
      onSection(section.id, { fields })
    const setStyle = (patch: InvoiceSectionStyle) => {
      const next = { ...style, ...patch }
      const kept = Object.fromEntries(
        Object.entries(next).filter(([, v]) => v !== undefined && v !== '')
      )
      onSectionStyle(section.id, Object.keys(kept).length ? kept : undefined)
    }

    return (
      <div className="w-[296px] shrink-0 overflow-y-auto border-l border-[#e3e5e9] bg-white p-4">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="mb-2 text-[12.5px] font-medium text-[#2563eb] hover:underline"
        >
          ◂ {t('documentStyling')}
        </button>
        <div className="mb-0.5 flex items-center justify-between">
          <div className="text-[15px] font-bold">{sectionName(section.id)}</div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-[15px] text-[#8a8f97]"
          >
            ✕
          </button>
        </div>
        <div className="mb-4 text-xs text-[#8a8f97]">{t('sectionSettings')}</div>

        <div className="space-y-3">
          {section.id === 'bank_account' && (
            <Group title={t('panelStyle')}>
              <Choice
                value={
                  section.variant ?? (template.headerStyle === 'framed' ? 'outline' : 'accent')
                }
                options={[
                  { value: 'accent', label: t('variant.accent') },
                  { value: 'panel', label: t('variant.panel') },
                  { value: 'outline', label: t('variant.outline') },
                  { value: 'lines', label: t('variant.lines') },
                ]}
                onChange={(variant) => onSection(section.id, { variant })}
              />
              <p className="text-[11.5px] leading-snug text-[#8a8f97]">{t('variant.hint')}</p>
            </Group>
          )}

          {section.id === 'totals' && (
            <Group title={t('panelStyle')}>
              <Choice
                value={section.variant ?? 'classic'}
                options={[
                  { value: 'classic', label: t('variant.classic') },
                  { value: 'box', label: t('variant.box') },
                  { value: 'panel', label: t('variant.panel') },
                  { value: 'accent', label: t('variant.accent') },
                ]}
                onChange={(variant) => onSection(section.id, { variant })}
              />
              <p className="text-[11.5px] leading-snug text-[#8a8f97]">{t('variant.totalsHint')}</p>
              <Row label={t('totalsWidth')}>
                <input
                  type="number"
                  min={140}
                  max={515}
                  value={style.width ?? ''}
                  placeholder={t('auto')}
                  onChange={(e) =>
                    setStyle({ width: e.target.value ? Number(e.target.value) : undefined })
                  }
                  className="h-7 w-20 rounded-md border border-[#e3e5e9] px-2 text-[12px]"
                />
              </Row>
              <p className="text-[11.5px] leading-snug text-[#8a8f97]">{t('totalsWidthHint')}</p>
            </Group>
          )}

          <Group title={t('placement')}>
            <Row label={t('visible')}>
              <Toggle
                on={section.visible}
                onChange={(visible) => onSection(section.id, { visible })}
              />
            </Row>
            {COLUMN_ELIGIBLE_SECTIONS.has(section.id) && (
              <Choice
                value={section.column ?? 'full'}
                options={[
                  { value: 'full', label: t('columnFull') },
                  { value: 'left', label: t('columnLeft') },
                  { value: 'right', label: t('columnRight') },
                ]}
                onChange={(v) =>
                  // Choosing a column is choosing to be in the flow, so a block
                  // that had been dragged somewhere comes back to take it.
                  onPlaceInFlow(section.id, v === 'full' ? undefined : (v as 'left' | 'right'))
                }
              />
            )}
            {BOXED_ELIGIBLE_SECTIONS.has(section.id) && (
              <Row label={t('drawBox')}>
                <Toggle
                  on={section.boxed !== false}
                  onChange={(boxed) => onSection(section.id, { boxed })}
                />
              </Row>
            )}
            {HEADED_SECTIONS.has(section.id) && (
              <Row label={t('showHeading')}>
                <Toggle
                  on={section.heading !== false}
                  onChange={(heading) => onSection(section.id, { heading })}
                />
              </Row>
            )}
          </Group>

          <Group title={t('spacing')}>
            {(layout.anchors?.[section.id] ||
              (section.id === 'header' && template.headerStyle === 'framed')) && (
              <p className="rounded-md bg-[#fef3c7] px-2.5 py-2 text-[11.5px] leading-snug text-[#92400e]">
                {t('placedByHand')}{' '}
                {section.id === 'header' && template.headerStyle === 'framed'
                  ? t('placedByHandFramed')
                  : t('placedByHandDrag')}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['marginTop', 'marginTop'],
                  ['marginBottom', 'marginBottom'],
                  ['marginLeft', 'marginLeft'],
                  ['marginRight', 'marginRight'],
                ] as const
              ).map(([key, labelKey]) => (
                <label key={key} className="flex items-center justify-between gap-1.5">
                  <span className="text-[12.5px] font-medium">{t(labelKey)}</span>
                  <input
                    type="number"
                    min={0}
                    max={key === 'marginLeft' || key === 'marginRight' ? 200 : 120}
                    value={style[key] ?? ''}
                    placeholder="0"
                    onChange={(e) =>
                      setStyle({ [key]: e.target.value ? Number(e.target.value) : undefined })
                    }
                    className="h-7 w-16 rounded-md border border-[#e3e5e9] px-2 text-[12px]"
                  />
                </label>
              ))}
            </div>
            <p className="text-[11.5px] leading-snug text-[#8a8f97]">{t('spacingHint')}</p>
          </Group>

          {/* The slogan is the workshop's own words, kept in company settings
              rather than here, because it is the same line wherever it is
              printed. When there is none the canvas shows a stand-in so the
              block can be found and placed, and that has to say so: it looks
              exactly like a real slogan otherwise, and it prints as nothing.
              Opened in a new tab so a layout in progress is not lost. */}
          {section.id === 'slogan' && (
            <Group title={t('slogan')}>
              <p className="text-[11.5px] leading-snug text-[#8a8f97]">
                {sloganSet ? t('sloganSetHint') : t('sloganPlaceholderHint')}{' '}
                <a
                  href="/settings/company"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#2563eb] underline underline-offset-2"
                >
                  {t('sloganLink')}
                </a>
              </p>
            </Group>
          )}

          {section.id === 'header' && (
            <Group title={t('logo')}>
              <LogoUpload value={logoUrl} own={ownLogo} onChange={onLogo} />
              {/* The logo is printed by the header, so its size is set where
                  the header is rather than in a list of sheet properties. */}
              <Slider
                label={t('size')}
                value={template.logoSize}
                min={50}
                max={200}
                suffix="%"
                onChange={(logoSize) => onTemplate({ logoSize })}
              />
              <p className="text-[11.5px] leading-snug text-[#8a8f97]">{t('logoHint')}</p>
            </Group>
          )}

          {/* The footer prints the same logo when it is switched on below, so
              it offers the same swap rather than sending somebody to the
              header to change a picture they are looking at down here. */}
          {section.id === 'footer' && (
            <Group title={t('logo')}>
              <LogoUpload value={logoUrl} own={ownLogo} onChange={onLogo} />
              <p className="text-[11.5px] leading-snug text-[#8a8f97]">{t('footerLogoHint')}</p>
            </Group>
          )}

          {SECTIONS_WITH_FIELDS.has(section.id) && (
            <Group title={t('fields')}>
              {resolvedFields.map((field) => (
                <div key={field.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {fieldName(field.id)}
                  </span>
                  {isCustomFieldId(field.id) && (
                    <button
                      type="button"
                      onClick={() => setFields(resolvedFields.filter((f) => f.id !== field.id))}
                      className="text-[13px] text-[#8a8f97] hover:text-[#1a1d21]"
                      title={t('removeField')}
                    >
                      ×
                    </button>
                  )}
                  <Toggle
                    on={field.visible}
                    onChange={(visible) =>
                      setFields(
                        resolvedFields.map((f) => (f.id === field.id ? { ...f, visible } : f))
                      )
                    }
                  />
                </div>
              ))}
              {unassignedCustomFields.length > 0 && (
                <div className="pt-1">
                  <div className="pb-1.5 text-[11.5px] text-[#8a8f97]">{t('yourCustomFields')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {unassignedCustomFields.map((field) => (
                      <button
                        key={field.id}
                        type="button"
                        onClick={() =>
                          setFields([
                            ...resolvedFields,
                            { id: toCustomFieldId(field.id), visible: true },
                          ])
                        }
                        className="rounded-md border border-dashed border-[#c9ccd1] px-2 py-1 text-[12px] text-[#5b6068] hover:border-[#2563eb] hover:text-[#2563eb]"
                      >
                        + {field.label || field.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Group>
          )}

          <Group title={t('appearance')}>
            {/* The header has no body text and no panel heading, so the same
                two inks get names that say what they actually color there. */}
            <Color
              label={section.id === 'header' ? t('details') : t('text')}
              value={style.textColor ?? ''}
              fallback="#111827"
              onChange={(textColor) => setStyle({ textColor })}
            />
            <Color
              label={section.id === 'header' ? t('companyName') : t('heading')}
              value={style.labelColor ?? ''}
              fallback={template.primaryColor}
              onChange={(labelColor) => setStyle({ labelColor })}
            />
            <Color
              label={t('fill')}
              value={style.backgroundColor ?? ''}
              fallback="#f3f4f6"
              onChange={(backgroundColor) => setStyle({ backgroundColor })}
            />
            <Color
              label={t('border')}
              value={style.borderColor ?? ''}
              fallback="#111827"
              onChange={(borderColor) => setStyle({ borderColor })}
            />
            <Row label={TABLE_SECTIONS.has(section.id) ? t('lineWidth') : t('borderWidth')}>
              <input
                type="number"
                min={0}
                max={4}
                step={0.25}
                value={style.borderWidth ?? ''}
                placeholder={t('auto')}
                onChange={(e) =>
                  setStyle({ borderWidth: e.target.value ? Number(e.target.value) : undefined })
                }
                className="h-7 w-20 rounded-md border border-[#e3e5e9] px-2 text-[12px]"
              />
            </Row>
            {TABLE_SECTIONS.has(section.id) && (
              <Row label={t('outerBorder')}>
                <Toggle
                  on={style.outerBorder === true}
                  onChange={(on) => setStyle({ outerBorder: on ? true : undefined })}
                />
              </Row>
            )}
            {TABLE_SECTIONS.has(section.id) && (
              <div>
                <div className="mb-1.5 text-[13px] font-medium">{t('rowBanding')}</div>
                <Choice
                  value={style.stripes === true ? 'on' : style.stripes === false ? 'off' : 'auto'}
                  options={[
                    { value: 'auto', label: t('likeSheet') },
                    { value: 'on', label: t('on') },
                    { value: 'off', label: t('off') },
                  ]}
                  onChange={(v) => setStyle({ stripes: v === 'auto' ? undefined : v === 'on' })}
                />
              </div>
            )}
            <Row label={t('size')}>
              <input
                type="number"
                min={5}
                max={24}
                value={style.fontSize ?? ''}
                placeholder={t('auto')}
                onChange={(e) =>
                  setStyle({ fontSize: e.target.value ? Number(e.target.value) : undefined })
                }
                className="h-7 w-20 rounded-md border border-[#e3e5e9] px-2 text-[12px]"
              />
            </Row>
            <Row label={t('font')}>
              <select
                value={style.fontFamily ?? ''}
                onChange={(e) => setStyle({ fontFamily: e.target.value || undefined })}
                className="h-7 rounded-md border border-[#e3e5e9] bg-white px-1.5 text-[12px]"
              >
                <option value="">{t('inherit')}</option>
                {FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </Row>
          </Group>
        </div>

        <div className="mt-4 rounded-md bg-[#f8f9fa] px-3 py-2.5 text-xs leading-relaxed text-[#8a8f97]">
          {t('sectionDragHint')}
        </div>
      </div>
    )
  }

  return (
    <div className="w-[296px] shrink-0 overflow-y-auto border-l border-[#e3e5e9] bg-white p-4">
      <div className="text-[15px] font-bold">{t('document')}</div>
      <div className="mb-4 text-xs text-[#8a8f97]">{t('documentSubtitle')}</div>

      <div className="space-y-3">
        <Group title={t('headerStyleTitle')}>
          {/* Not a property of the header section: it decides whether the sheet
              has a band and a rail at all, and what the page's insets are. */}
          <div className="flex flex-col gap-1">
            {HEADER_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => onTemplate({ headerStyle: style })}
                className="rounded-md border px-3 py-2 text-left text-[13px]"
                style={{
                  borderColor: template.headerStyle === style ? '#2563eb' : '#e3e5e9',
                  background: template.headerStyle === style ? '#eef2ff' : '#fff',
                  fontWeight: template.headerStyle === style ? 600 : 400,
                }}
              >
                {t(`headerStyle.${style}.name`)}
                <span className="block text-[11.5px] font-normal text-[#8a8f97]">
                  {t(`headerStyle.${style}.desc`)}
                </span>
              </button>
            ))}
          </div>
        </Group>

        <Group title={t('colors')}>
          <Color
            label={t('primary')}
            value={template.primaryColor}
            fallback="#d97706"
            clearable={false}
            onChange={(primaryColor) => onTemplate({ primaryColor })}
          />
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onTemplate({ primaryColor: color })}
                className="h-6 w-6 rounded-full"
                style={{
                  background: color,
                  border:
                    template.primaryColor === color ? '2px solid #1a1d21' : '2px solid transparent',
                }}
              />
            ))}
          </div>
          <Color
            label={t('background')}
            value={template.backgroundColor}
            fallback="#ffffff"
            onChange={(backgroundColor) => onTemplate({ backgroundColor })}
          />
          <Color
            label={t('text')}
            value={template.textColor}
            fallback="#111827"
            onChange={(textColor) => onTemplate({ textColor })}
          />
          <Color
            label={t('companyName')}
            value={template.companyTextColor}
            fallback="#ffffff"
            onChange={(companyTextColor) => onTemplate({ companyTextColor })}
          />
          <Color
            label={t('accent')}
            value={doc.accentColor ?? ''}
            fallback={template.primaryColor}
            onChange={(accentColor) => onDocument({ accentColor: accentColor || undefined })}
          />
        </Group>

        {template.headerStyle === 'framed' && (
          <Group title={t('frame')}>
            <div>
              <div className="mb-1.5 text-[13px] font-medium">{t('rail')}</div>
              <Choice
                value={template.frameSide === 'right' ? 'right' : 'left'}
                options={[
                  { value: 'left', label: t('leftEdge') },
                  { value: 'right', label: t('rightEdge') },
                ]}
                onChange={(frameSide) => onTemplate({ frameSide })}
              />
            </div>
            <Color
              label={t('frameLine')}
              value={template.frameBorderColor}
              fallback="#111827"
              onChange={(frameBorderColor) => onTemplate({ frameBorderColor })}
            />
            <Slider
              label={t('cornerRadius')}
              value={template.frameRadius}
              min={0}
              max={24}
              suffix="pt"
              onChange={(frameRadius) => onTemplate({ frameRadius })}
            />
            <div>
              <div className="mb-1.5 text-[13px] font-medium">{t('shadow')}</div>
              <Choice
                value={
                  template.frameShadow === 'false' ||
                  template.frameShadow === 'thin' ||
                  template.frameShadow === 'wide'
                    ? template.frameShadow
                    : 'true'
                }
                options={[
                  { value: 'false', label: t('off') },
                  { value: 'thin', label: t('shadowThin') },
                  { value: 'true', label: t('shadowNormal') },
                  { value: 'wide', label: t('shadowWide') },
                ]}
                onChange={(frameShadow) => onTemplate({ frameShadow })}
              />
            </div>
          </Group>
        )}

        <Group title={t('typography')}>
          <select
            value={template.fontFamily}
            onChange={(e) => onTemplate({ fontFamily: e.target.value })}
            className="w-full rounded-md border border-[#e3e5e9] bg-white px-2.5 py-2 text-[13px]"
            style={{ fontFamily: fontStack(template.fontFamily) }}
          >
            {FONT_OPTIONS.map((font) => (
              <option
                key={font.value}
                value={font.value}
                style={{ fontFamily: fontStack(font.value) }}
              >
                {font.label}
              </option>
            ))}
          </select>
          <Slider
            label={t('baseSize')}
            value={doc.fontSize ?? BASE_FONT_SIZE}
            min={6}
            max={14}
            suffix="pt"
            onChange={(fontSize) => onDocument({ fontSize })}
          />
        </Group>

        <Group title={t('page')}>
          <Slider
            label={t('margins')}
            value={doc.margin ?? 40}
            min={12}
            max={72}
            suffix="pt"
            onChange={(margin) => onDocument({ margin })}
          />
          <Slider
            label={t('rowHeight')}
            value={doc.rowPadding ?? 5}
            min={0}
            max={12}
            suffix="pt"
            onChange={(rowPadding) => onDocument({ rowPadding })}
          />
          <Row label={t('rowBanding')}>
            <Toggle on={doc.stripes !== false} onChange={(stripes) => onDocument({ stripes })} />
          </Row>
          <Color
            label={t('band')}
            value={doc.stripeColor ?? ''}
            fallback="#f3f4f6"
            onChange={(stripeColor) => onDocument({ stripeColor: stripeColor || undefined })}
          />
        </Group>
      </div>
    </div>
  )
}
