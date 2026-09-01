'use client'

import { interactiveRow } from '@/lib/interactive-row'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { DateInput } from '@/components/ui/date-input'
import { DocsLink } from '@/components/docs-link'
import { useGlassModal } from '@/components/glass-modal'
import { useConfirm } from '@/components/confirm-dialog'
import {
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
} from '@/features/custom-fields/Actions/customFieldActions'
import { setCustomFieldPlacement } from '@/features/settings/Actions/invoiceLayoutActions'
import type { FieldType, EntityType } from '@/features/custom-fields/Schema/customFieldSchema'
import {
  type InvoiceLayoutConfig,
  BUILTIN_SECTIONS,
  CUSTOM_FIELD_PREFIX,
  SECTIONS_WITH_FIELDS,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'

interface FieldDef {
  id: string
  name: string
  label: string
  fieldType: string
  options: string | null
  defaultValue: string | null
  required: boolean
  entityType: string
  sortOrder: number
  isActive: boolean
}

/** Section ids a custom field can be placed into, in document order. */
const PLACEMENT_SECTIONS = BUILTIN_SECTIONS.map((s) => s.id).filter((id) =>
  SECTIONS_WITH_FIELDS.has(id)
)

/**
 * Find where a custom field definition is placed in a layout config. A field
 * can be switched on in several sections from the designer; the first visible
 * one (in document order) stands for it here. Returns that section id,
 * 'hidden' when it is stored but switched on nowhere, or null if unassigned.
 */
function getPlacementForField(
  definitionId: string,
  layoutConfig?: InvoiceLayoutConfig
): string | null {
  if (!layoutConfig) return null
  const cfId = `${CUSTOM_FIELD_PREFIX}${definitionId}`
  let stored = false
  for (const section of layoutConfig.sections) {
    const entry = section.fields?.find((f) => f.id === cfId)
    if (entry) {
      if (entry.visible) return section.id
      stored = true
    }
  }
  return stored ? 'hidden' : null
}

export function CustomFieldsManager({
  initialFields = [],
  layoutConfig,
  quoteLayoutConfig,
}: {
  initialFields?: FieldDef[]
  layoutConfig?: InvoiceLayoutConfig
  quoteLayoutConfig?: InvoiceLayoutConfig
}) {
  const router = useRouter()
  const t = useTranslations('settings')
  const modal = useGlassModal()
  const confirm = useConfirm()
  const fields = initialFields
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<FieldDef | null>(null)
  const [loading, setLoading] = useState(false)
  const [filterEntity, setFilterEntity] = useState<string>('all')

  const [formData, setFormData] = useState({
    name: '',
    label: '',
    fieldType: 'text' as FieldType,
    options: '',
    defaultValue: '',
    required: false,
    entityType: 'service_record' as EntityType,
    sortOrder: 0,
    isActive: true,
  })
  // Where the field prints on the document; null = derived placement unknown.
  const [placement, setPlacement] = useState<string>('general')
  const [initialPlacement, setInitialPlacement] = useState<string | null>(null)

  const configForEntity = (entityType: string) =>
    entityType === 'quote' ? quoteLayoutConfig : layoutConfig

  const fieldTypeLabels: Record<string, string> = {
    text: t('customFields.fieldTypes.text'),
    number: t('customFields.fieldTypes.number'),
    date: t('customFields.fieldTypes.date'),
    select: t('customFields.fieldTypes.select'),
    checkbox: t('customFields.fieldTypes.checkbox'),
    textarea: t('customFields.fieldTypes.textarea'),
  }

  const entityTypeLabels: Record<string, string> = {
    service_record: t('customFields.serviceRecord'),
    quote: t('customFields.quote'),
  }

  const resetForm = () => {
    setFormData({
      name: '',
      label: '',
      fieldType: 'text',
      options: '',
      defaultValue: '',
      required: false,
      entityType: 'service_record',
      sortOrder: 0,
      isActive: true,
    })
    setPlacement('general')
    setInitialPlacement(null)
    setEditing(null)
  }

  const openCreate = () => {
    resetForm()
    setShowDialog(true)
  }

  const openEdit = (field: FieldDef) => {
    setEditing(field)
    setFormData({
      name: field.name,
      label: field.label,
      fieldType: field.fieldType as FieldType,
      options: field.options || '',
      defaultValue: field.defaultValue || '',
      required: field.required,
      entityType: field.entityType as EntityType,
      sortOrder: field.sortOrder,
      isActive: field.isActive,
    })
    const current = getPlacementForField(field.id, configForEntity(field.entityType)) ?? 'general'
    setPlacement(current)
    setInitialPlacement(current)
    setShowDialog(true)
  }

  const handleSave = async () => {
    setLoading(true)
    const payload = {
      ...formData,
      options: formData.fieldType === 'select' ? formData.options : undefined,
      defaultValue: formData.defaultValue || undefined,
    }

    const result = editing
      ? await updateFieldDefinition({ id: editing.id, ...payload })
      : await createFieldDefinition(payload)

    if (result.success) {
      const definitionId = editing ? editing.id : result.data?.id
      if (definitionId && (!editing || placement !== initialPlacement)) {
        const placementResult = await setCustomFieldPlacement({
          definitionId,
          entityType: formData.entityType,
          placement,
        })
        if (!placementResult.success) {
          modal.open(
            'error',
            'Error',
            placementResult.error || t('customFields.failedSavePlacement')
          )
        }
      }
      toast.success(editing ? t('customFields.fieldUpdated') : t('customFields.fieldCreated'))
      setShowDialog(false)
      resetForm()
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('customFields.failedSave'))
    }
    setLoading(false)
  }

  const handleDelete = async (field: FieldDef) => {
    const ok = await confirm({
      title: t('customFields.deleteTitle'),
      description: t('customFields.deleteDescription', { label: field.label }),
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    const result = await deleteFieldDefinition(field.id)
    if (result.success) {
      toast.success(t('customFields.fieldDeleted'))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('customFields.failedDelete'))
    }
  }

  const filtered =
    filterEntity === 'all' ? fields : fields.filter((f) => f.entityType === filterEntity)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {['all', 'service_record', 'quote'].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterEntity(key)}
              className={`text-sm font-medium transition-colors ${
                filterEntity === key
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {key === 'all' ? t('customFields.filterAll') : entityTypeLabels[key]}
              <span className="ml-1 text-xs text-muted-foreground">
                ({key === 'all' ? fields.length : fields.filter((f) => f.entityType === key).length}
                )
              </span>
            </button>
          ))}
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" /> {t('customFields.addField')}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          {t('customFields.emptyState')}
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {filtered.map((field) => {
            const fieldConfig = configForEntity(field.entityType)
            const fieldPlacement = fieldConfig ? getPlacementForField(field.id, fieldConfig) : null
            return (
              <div
                key={field.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer"
                {...interactiveRow(() => openEdit(field))}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{field.label}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {fieldTypeLabels[field.fieldType] || field.fieldType}
                    </span>
                    {field.required && <span className="text-xs text-amber-600">*</span>}
                    {!field.isActive && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] text-gray-500">
                        {t('customFields.inactive')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {field.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">·</span>
                    <span className="text-[11px] text-muted-foreground">
                      {entityTypeLabels[field.entityType]}
                    </span>
                    {fieldConfig && (
                      <>
                        <span className="text-[11px] text-muted-foreground">·</span>
                        {fieldPlacement === 'hidden' ? (
                          <span className="text-[11px] text-muted-foreground">
                            {t('customFields.placementHidden')}
                          </span>
                        ) : fieldPlacement ? (
                          <span className="text-[11px] text-blue-600">
                            {t(`layoutEditor.sections.${fieldPlacement}`)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">
                            {t('customFields.unassigned')}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div
                  className="flex items-center gap-0.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(field)}
                    aria-label={t('customFields.edit')}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(field)}
                    aria-label={t('customFields.delete')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('customFields.editField') : t('customFields.newField')}
            </DialogTitle>
            <DocsLink
              href="/docs/configuration/custom-fields"
              variant="hint"
              className="self-start"
            />
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('customFields.label')}</Label>
              <Input
                placeholder={t('customFields.labelPlaceholder')}
                value={formData.label}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    label: e.target.value,
                    name: editing
                      ? formData.name
                      : e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '_')
                          .replace(/^_|_$/g, ''),
                  })
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('customFields.fieldName')}</Label>
              <Input
                placeholder={t('customFields.fieldNamePlaceholder')}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={!!editing}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{t('customFields.fieldNameHint')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('customFields.fieldType')}</Label>
                <Select
                  value={formData.fieldType}
                  onValueChange={(v) =>
                    setFormData({ ...formData, fieldType: v as FieldType, defaultValue: '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">{t('customFields.fieldTypes.text')}</SelectItem>
                    <SelectItem value="number">{t('customFields.fieldTypes.number')}</SelectItem>
                    <SelectItem value="date">{t('customFields.fieldTypes.date')}</SelectItem>
                    <SelectItem value="select">{t('customFields.fieldTypes.select')}</SelectItem>
                    <SelectItem value="checkbox">
                      {t('customFields.fieldTypes.checkbox')}
                    </SelectItem>
                    <SelectItem value="textarea">
                      {t('customFields.fieldTypes.textarea')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('customFields.entityType')}</Label>
                <Select
                  value={formData.entityType}
                  onValueChange={(v) => setFormData({ ...formData, entityType: v as EntityType })}
                  disabled={!!editing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service_record">
                      {t('customFields.serviceRecord')}
                    </SelectItem>
                    <SelectItem value="quote">{t('customFields.quote')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.fieldType === 'select' && (
              <div className="space-y-2">
                <Label>{t('customFields.optionsLabel')}</Label>
                <Input
                  placeholder={t('customFields.optionsPlaceholder')}
                  value={formData.options}
                  onChange={(e) => {
                    const options = e.target.value
                    const opts = options
                      .split(',')
                      .map((o) => o.trim())
                      .filter(Boolean)
                    setFormData({
                      ...formData,
                      options,
                      defaultValue: opts.includes(formData.defaultValue)
                        ? formData.defaultValue
                        : '',
                    })
                  }}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>{t('customFields.defaultValue')}</Label>
              {formData.fieldType === 'text' && (
                <Input
                  value={formData.defaultValue}
                  onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value })}
                />
              )}
              {formData.fieldType === 'number' && (
                <Input
                  type="number"
                  value={formData.defaultValue}
                  onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value })}
                />
              )}
              {formData.fieldType === 'date' && (
                <DateInput
                  value={formData.defaultValue}
                  onChange={(v) => setFormData({ ...formData, defaultValue: v })}
                />
              )}
              {formData.fieldType === 'textarea' && (
                <Textarea
                  value={formData.defaultValue}
                  onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value })}
                  rows={2}
                />
              )}
              {formData.fieldType === 'checkbox' && (
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    checked={formData.defaultValue === 'true'}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, defaultValue: String(checked === true) })
                    }
                  />
                  <span className="text-sm text-muted-foreground">
                    {t('customFields.defaultValueCheckedHint')}
                  </span>
                </div>
              )}
              {formData.fieldType === 'select' && (
                <Select
                  value={formData.defaultValue || 'none'}
                  onValueChange={(v) =>
                    setFormData({ ...formData, defaultValue: v === 'none' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('customFields.defaultValueNone')}</SelectItem>
                    {formData.options
                      .split(',')
                      .map((o) => o.trim())
                      .filter(Boolean)
                      .map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">{t('customFields.defaultValueHint')}</p>
            </div>

            <div className="space-y-2">
              <Label>{t('customFields.placement')}</Label>
              <Select value={placement} onValueChange={setPlacement}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLACEMENT_SECTIONS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {t(`layoutEditor.sections.${id}`)}
                    </SelectItem>
                  ))}
                  <SelectItem value="hidden">{t('customFields.placementHidden')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('customFields.placementHint')}</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.required}
                  onCheckedChange={(checked) => setFormData({ ...formData, required: checked })}
                />
                <Label>{t('customFields.required')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label>{t('customFields.active')}</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowDialog(false)
                  resetForm()
                }}
              >
                {t('customFields.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={loading || !formData.name || !formData.label}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? t('customFields.update') : t('customFields.create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
