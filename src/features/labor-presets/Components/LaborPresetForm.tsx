'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { LABOR_HOURS_MAX, UNIT_PRICE_MAX } from '@/lib/input-limits'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DocsLink } from '@/components/docs-link'
import { useGlassModal } from '@/components/glass-modal'
import { createLaborPreset, updateLaborPreset } from '../Actions/laborPresetActions'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { PresetPartsEditor } from './PresetPartsEditor'
import type { PresetPartItem } from './PresetPartsEditor'
import { clearableInput } from '@/lib/clearable'
import { namelessItemRows } from '../Lib/namelessItems'
import { useFieldErrorText } from '@/components/field-errors'
import type { FieldError } from '@/lib/field-errors'

type PricingType = 'hourly' | 'service'

interface PresetItem {
  description: string
  hours: number
  rate: number
  pricingType: PricingType
}

interface SingleItem {
  name: string
  description: string
  hours: number
  rate: number
  pricingType: PricingType
}

interface LaborPresetData {
  id: string
  name: string
  description: string | null
  items: {
    description: string
    hours: number
    rate: number
    pricingType?: string
    sortOrder: number
  }[]
  parts?: {
    name: string
    partNumber: string | null
    quantity: number
    unit: string | null
    category?: string | null
    unitPrice: number
    inventoryPartId: string | null
    sortOrder: number
  }[]
}

type PresetMode = 'single' | 'package'

interface LaborPresetFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset?: LaborPresetData
  defaultLaborRate?: number
  inventoryParts?: {
    id: string
    name: string
    partNumber: string | null
    unit: string | null
    category?: string | null
    sellPrice: number
    unitCost: number
    quantity: number
    /** Searched by the preset's part picker and name suggestions. */
    tags?: string[]
  }[]
  currencyCode?: string
}

function detectMode(preset?: LaborPresetData): PresetMode {
  if (!preset) return 'single'
  if (preset.items.length === 1 && preset.name === preset.items[0].description) return 'single'
  return 'package'
}

function PricingTypeToggle({
  value,
  onChange,
  tHourly,
  tService,
}: {
  value: PricingType
  onChange: (v: PricingType) => void
  tHourly: string
  tService: string
}) {
  return (
    <button
      type="button"
      className={`shrink-0 rounded-md border px-2 text-[10px] font-medium transition-colors ${
        value === 'service'
          ? 'border-blue-500/30 bg-blue-500/10 text-blue-600'
          : 'border-muted text-muted-foreground hover:text-foreground'
      }`}
      onClick={() => onChange(value === 'service' ? 'hourly' : 'service')}
    >
      {value === 'service' ? tService : tHourly}
    </button>
  )
}

export function LaborPresetForm({
  open,
  onOpenChange,
  preset,
  defaultLaborRate = 0,
  inventoryParts,
  currencyCode,
}: LaborPresetFormProps) {
  const router = useRouter()
  const modal = useGlassModal()
  const t = useTranslations('laborPresets')
  const fieldErrorText = useFieldErrorText()
  /** Why a save failed: what the schema refused in the person's words, else the server's. */
  const failure = (result: { error?: string; fieldErrors?: FieldError[] }) =>
    result.fieldErrors?.length
      ? result.fieldErrors.map((error) => fieldErrorText(error)).join(' ')
      : result.error || t('errors.saveFailed')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<PresetMode>(() => detectMode(preset))

  // Package mode state
  const [name, setName] = useState(preset?.name ?? '')
  const [description, setDescription] = useState(preset?.description ?? '')
  const [items, setItems] = useState<PresetItem[]>(
    preset?.items.map((i) => ({
      description: i.description,
      hours: i.hours,
      rate: i.rate,
      pricingType: (i.pricingType as PricingType) || 'hourly',
    })) ?? [{ description: '', hours: 0, rate: defaultLaborRate, pricingType: 'hourly' }]
  )

  // Single item mode state
  const [singleItems, setSingleItems] = useState<SingleItem[]>(() => {
    if (preset && detectMode(preset) === 'single') {
      return [
        {
          name: preset.items[0].description,
          description: preset.description ?? '',
          hours: preset.items[0].hours,
          rate: preset.items[0].rate,
          pricingType: (preset.items[0].pricingType as PricingType) || 'hourly',
        },
      ]
    }
    return [{ name: '', description: '', hours: 0, rate: defaultLaborRate, pricingType: 'hourly' }]
  })

  const [parts, setParts] = useState<PresetPartItem[]>(
    preset?.parts?.map((p) => ({
      name: p.name,
      partNumber: p.partNumber || '',
      quantity: p.quantity,
      unit: p.unit ?? null,
      category: p.category ?? null,
      unitPrice: p.unitPrice,
      inventoryPartId: p.inventoryPartId || '',
    })) ?? []
  )

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      const detectedMode = detectMode(preset)
      setMode(detectedMode)
      setName(preset?.name ?? '')
      setDescription(preset?.description ?? '')
      setItems(
        preset?.items.map((i) => ({
          description: i.description,
          hours: i.hours,
          rate: i.rate,
          pricingType: (i.pricingType as PricingType) || 'hourly',
        })) ?? [{ description: '', hours: 0, rate: defaultLaborRate, pricingType: 'hourly' }]
      )
      if (detectedMode === 'single' && preset) {
        setSingleItems([
          {
            name: preset.items[0].description,
            description: preset.description ?? '',
            hours: preset.items[0].hours,
            rate: preset.items[0].rate,
            pricingType: (preset.items[0].pricingType as PricingType) || 'hourly',
          },
        ])
      } else {
        setSingleItems([
          { name: '', description: '', hours: 0, rate: defaultLaborRate, pricingType: 'hourly' },
        ])
      }
      setParts(
        preset?.parts?.map((p) => ({
          name: p.name,
          partNumber: p.partNumber || '',
          quantity: p.quantity,
          unit: p.unit ?? null,
          category: p.category ?? null,
          unitPrice: p.unitPrice,
          inventoryPartId: p.inventoryPartId || '',
        })) ?? []
      )
    }
    onOpenChange(isOpen)
  }

  /**
   * Rows that were refused for want of a name, by index in the mode on
   * screen. Said under the row's own name field rather than in a box about
   * the whole form; a row's mark goes when it is named or removed.
   */
  const [namelessRows, setNamelessRows] = useState<number[]>([])
  const nameFieldId = (index: number) => `preset-item-name-${index}`
  const nameErrorId = (index: number) => `preset-item-name-error-${index}`
  const markNameless = (rows: number[]) => {
    setNamelessRows(rows)
    document.getElementById(nameFieldId(rows[0]))?.focus()
  }
  const nameInvalidProps = (index: number) =>
    namelessRows.includes(index)
      ? { 'aria-invalid': true, 'aria-describedby': nameErrorId(index) }
      : {}
  const nameError = (index: number) =>
    namelessRows.includes(index) ? (
      <p id={nameErrorId(index)} role="alert" className="col-span-full text-xs text-destructive">
        {t('errors.itemNameMissing')}
      </p>
    ) : null

  const handleModeChange = (newMode: PresetMode) => {
    setMode(newMode)
    setNamelessRows([])
  }

  // Package mode helpers
  const updateItem = (index: number, field: keyof PresetItem, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
    if (field === 'description') setNamelessRows((rows) => rows.filter((row) => row !== index))
  }

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { description: '', hours: 0, rate: defaultLaborRate, pricingType: 'hourly' },
    ])
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
    setNamelessRows([])
  }

  // Single item mode helpers
  const updateSingleItem = (index: number, field: keyof SingleItem, value: string | number) => {
    setSingleItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
    if (field === 'name') setNamelessRows((rows) => rows.filter((row) => row !== index))
  }

  const addSingleItem = () => {
    setSingleItems((prev) => [
      ...prev,
      { name: '', description: '', hours: 0, rate: defaultLaborRate, pricingType: 'hourly' },
    ])
  }

  const removeSingleItem = (index: number) => {
    setSingleItems((prev) => prev.filter((_, i) => i !== index))
    setNamelessRows([])
  }

  const buildPartsPayload = () =>
    parts
      .filter((p) => p.name.trim())
      .map((part, index) => ({
        name: part.name,
        partNumber: part.partNumber || undefined,
        quantity: Number(part.quantity) || 1,
        unit: part.unit ?? undefined,
        category: part.category ?? undefined,
        unitPrice: Number(part.unitPrice) || 0,
        inventoryPartId: part.inventoryPartId || undefined,
        sortOrder: index,
      }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const partsPayload = buildPartsPayload()

    if (mode === 'single') {
      const nameless = namelessItemRows(singleItems)
      if (nameless.length > 0) {
        markNameless(nameless)
        setLoading(false)
        return
      }
      const validItems = singleItems.filter((i) => i.name.trim())

      if (preset) {
        const item = validItems[0]
        const result = await updateLaborPreset({
          id: preset.id,
          name: '',
          // '' clears a description the preset used to have.
          description: item.description.trim(),
          items: [
            {
              description: item.name,
              hours: Number(item.hours) || 0,
              rate: Number(item.rate) || 0,
              pricingType: item.pricingType,
              sortOrder: 0,
            },
          ],
          parts: partsPayload,
        })
        if (result.success) {
          onOpenChange(false)
          router.refresh()
        } else {
          modal.open('error', t('errors.error'), failure(result))
        }
      } else {
        let allSuccess = true
        for (const item of validItems) {
          const result = await createLaborPreset({
            name: '',
            description: item.description || undefined,
            items: [
              {
                description: item.name,
                hours: Number(item.hours) || 0,
                rate: Number(item.rate) || 0,
                pricingType: item.pricingType,
                sortOrder: 0,
              },
            ],
            parts: partsPayload,
          })
          if (!result.success) {
            modal.open('error', t('errors.error'), failure(result))
            allSuccess = false
            break
          }
        }
        if (allSuccess) {
          onOpenChange(false)
          router.refresh()
        }
      }
    } else {
      const nameless = namelessItemRows(
        items.map((item) => ({ name: item.description, hours: item.hours }))
      )
      if (nameless.length > 0) {
        markNameless(nameless)
        setLoading(false)
        return
      }
      const validItems = items.filter((i) => i.description.trim())

      const data = {
        name,
        description: clearableInput(description, Boolean(preset)),
        items: validItems.map((item, index) => ({
          description: item.description,
          hours: Number(item.hours) || 0,
          rate: Number(item.rate) || 0,
          pricingType: item.pricingType,
          sortOrder: index,
        })),
        parts: partsPayload,
      }

      const result = preset
        ? await updateLaborPreset({ ...data, id: preset.id })
        : await createLaborPreset(data)
      if (result.success) {
        onOpenChange(false)
        router.refresh()
      } else {
        modal.open('error', t('errors.error'), failure(result))
      }
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{preset ? t('form.editPackage') : t('form.addPackage')}</DialogTitle>
          <DocsLink
            href="/docs/configuration/work-orders/labor-presets"
            variant="hint"
            className="self-start"
          />

          {/* Mode tabs, pinned with the title so the switch is always in reach */}
          <div className="mt-1 flex rounded-lg border bg-muted/50 p-0.5">
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'single'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleModeChange('single')}
            >
              {t('form.singleItem')}
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'package'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleModeChange('package')}
            >
              {t('form.package')}
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            {mode === 'single' ? (
              <div className="space-y-2">
                <div className="hidden grid-cols-[2fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
                  <span>{t('form.singleNameLabel')}</span>
                  <span>{t('form.itemQtyOrHours')}</span>
                  <span>{t('form.itemRate')}</span>
                  <span />
                </div>

                {singleItems.map((item, i) => (
                  <div key={i} className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                      <div className="col-span-2 flex gap-2 sm:col-span-1">
                        <Input
                          id={nameFieldId(i)}
                          aria-label={t('form.singleNameLabel')}
                          {...nameInvalidProps(i)}
                          placeholder={t('form.singleNamePlaceholder')}
                          value={item.name}
                          onChange={(e) => updateSingleItem(i, 'name', e.target.value)}
                          className="flex-1"
                        />
                        <PricingTypeToggle
                          value={item.pricingType}
                          onChange={(v) => updateSingleItem(i, 'pricingType', v)}
                          tHourly={t('form.hourlyTag')}
                          tService={t('form.serviceTag')}
                        />
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max={LABOR_HOURS_MAX}
                        step={item.pricingType === 'service' ? '1' : 'any'}
                        placeholder={
                          item.pricingType === 'service' ? t('form.itemQty') : t('form.itemHours')
                        }
                        value={item.hours}
                        onChange={(e) => updateSingleItem(i, 'hours', e.target.value)}
                      />
                      <Input
                        type="number"
                        min="0"
                        max={UNIT_PRICE_MAX}
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => updateSingleItem(i, 'rate', e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => removeSingleItem(i)}
                        disabled={singleItems.length <= 1}
                        aria-label={t('actions.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {nameError(i)}
                    </div>
                    <Textarea
                      placeholder={t('form.descriptionPlaceholder')}
                      value={item.description}
                      onChange={(e) => updateSingleItem(i, 'description', e.target.value)}
                      rows={2}
                    />
                  </div>
                ))}

                <button
                  type="button"
                  className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                  onClick={addSingleItem}
                >
                  <Plus className="h-4 w-4" />
                </button>

                <PresetPartsEditor
                  parts={parts}
                  onPartsChange={setParts}
                  inventoryParts={inventoryParts}
                  currencyCode={currencyCode}
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="preset-name">{t('form.nameLabel')}</Label>
                  <Input
                    id="preset-name"
                    placeholder={t('form.namePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preset-description">{t('form.descriptionLabel')}</Label>
                  <Textarea
                    id="preset-description"
                    placeholder={t('form.descriptionPlaceholder')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t('form.itemsTitle')}</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addItem}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t('form.addItem')}
                    </Button>
                  </div>

                  <div className="hidden grid-cols-[2fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
                    <span>{t('form.itemDescription')}</span>
                    <span>{t('form.itemQtyOrHours')}</span>
                    <span>{t('form.itemRate')}</span>
                    <span />
                  </div>

                  {items.map((item, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                      <div className="col-span-2 flex gap-2 sm:col-span-1">
                        <Input
                          id={nameFieldId(i)}
                          aria-label={t('form.itemDescription')}
                          {...nameInvalidProps(i)}
                          placeholder={t('form.itemDescriptionPlaceholder')}
                          value={item.description}
                          onChange={(e) => updateItem(i, 'description', e.target.value)}
                          className="flex-1"
                        />
                        <PricingTypeToggle
                          value={item.pricingType}
                          onChange={(v) => updateItem(i, 'pricingType', v)}
                          tHourly={t('form.hourlyTag')}
                          tService={t('form.serviceTag')}
                        />
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max={LABOR_HOURS_MAX}
                        step={item.pricingType === 'service' ? '1' : 'any'}
                        placeholder={
                          item.pricingType === 'service' ? t('form.itemQty') : t('form.itemHours')
                        }
                        value={item.hours}
                        onChange={(e) => updateItem(i, 'hours', e.target.value)}
                      />
                      <Input
                        type="number"
                        min="0"
                        max={UNIT_PRICE_MAX}
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => updateItem(i, 'rate', e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(i)}
                        disabled={items.length <= 1}
                        aria-label={t('actions.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {nameError(i)}
                    </div>
                  ))}

                  <button
                    type="button"
                    className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                    onClick={addItem}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <PresetPartsEditor
                  parts={parts}
                  onPartsChange={setParts}
                  inventoryParts={inventoryParts}
                  currencyCode={currencyCode}
                />
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('form.cancel')}
            </Button>
            <Button data-save-shortcut type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {preset ? t('form.saveChanges') : t('form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
