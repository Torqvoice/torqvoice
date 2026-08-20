'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocsLink } from '@/components/docs-link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DateInput } from '@/components/ui/date-input'
import { Loader2, Plus, X } from 'lucide-react'
import {
  CARD_ENTITIES,
  CARD_ENTITY_FIELDS,
  OPERATORS_BY_TYPE,
  getField,
  type CardEntity,
  type CardFilter,
  type CustomWidget,
} from '../custom-cards/registry'
import { createDashboardWidget, updateDashboardWidget } from '../Actions/customCardActions'

/**
 * Create/edit dialog for custom table cards: pick a data source, stack
 * filters (field / operator / type-aware value input), choose columns and a
 * row limit. Everything offered here comes from the field registry, which
 * the server validates again on save and on every run.
 */
export function CustomCardDialog({
  open,
  onOpenChange,
  widget,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, the dialog edits this widget instead of creating one */
  widget?: CustomWidget | null
  onSaved: (widget: CustomWidget) => void
}) {
  const t = useTranslations('dashboard.customCards')
  const [name, setName] = useState('')
  const [entity, setEntity] = useState<CardEntity>('vehicles')
  const [filters, setFilters] = useState<CardFilter[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [limit, setLimit] = useState(10)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (widget) {
      setName(widget.name)
      setEntity(widget.config.entity)
      setFilters(widget.config.filters)
      setColumns(widget.config.columns)
      setLimit(widget.config.limit)
    } else {
      setName('')
      setEntity('vehicles')
      setFilters([])
      setColumns(CARD_ENTITY_FIELDS.vehicles.slice(0, 4).map((f) => f.id))
      setLimit(10)
    }
  }, [open, widget])

  const fields = CARD_ENTITY_FIELDS[entity]

  const changeEntity = (next: CardEntity) => {
    setEntity(next)
    setFilters([])
    setColumns(CARD_ENTITY_FIELDS[next].slice(0, 4).map((f) => f.id))
  }

  const addFilter = () => {
    const first = fields.find((f) => f.filterable !== false)
    if (!first) return
    setFilters([
      ...filters,
      { field: first.id, operator: OPERATORS_BY_TYPE[first.type][0], value: '' },
    ])
  }

  const updateFilter = (index: number, patch: Partial<CardFilter>) => {
    setFilters(
      filters.map((flt, i) => {
        if (i !== index) return flt
        const next = { ...flt, ...patch }
        // Field change resets operator and value to something valid for the type
        if (patch.field) {
          const def = getField(entity, patch.field)
          next.operator = def ? OPERATORS_BY_TYPE[def.type][0] : 'contains'
          next.value = ''
        }
        return next
      })
    )
  }

  const toggleColumn = (id: string) => {
    setColumns((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : prev.length < 8 ? [...prev, id] : prev
    )
  }

  const handleSave = async () => {
    if (!name.trim() || columns.length === 0) return
    setSaving(true)
    const config = {
      entity,
      filters: filters.filter((f) => f.value.trim() !== ''),
      columns,
      limit,
    }
    const result = widget
      ? await updateDashboardWidget(widget.id, name.trim(), config)
      : await createDashboardWidget(name.trim(), config)
    setSaving(false)
    if (result.success && result.data) {
      onSaved(result.data)
      onOpenChange(false)
    } else {
      toast.error(result.error || t('saveError'))
    }
  }

  const valueInput = (filter: CardFilter, index: number) => {
    const def = getField(entity, filter.field)
    if (!def) return null
    if (def.type === 'date') {
      return (
        <DateInput
          value={filter.value}
          onChange={(v) => updateFilter(index, { value: v })}
          className="h-9"
        />
      )
    }
    if (def.type === 'select') {
      return (
        <Select
          value={filter.value || undefined}
          onValueChange={(v) => updateFilter(index, { value: v })}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder={t('valuePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {def.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {t(`options.${opt}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    return (
      <Input
        type={def.type === 'number' ? 'number' : 'text'}
        value={filter.value}
        onChange={(e) => updateFilter(index, { value: e.target.value })}
        placeholder={t('valuePlaceholder')}
        className="h-9"
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{widget ? t('editCard') : t('addCard')}</DialogTitle>
          <DocsLink href="/docs/features/dashboard" variant="hint" className="self-start" />
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="card-name">{t('cardName')}</Label>
              <Input
                id="card-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>{t('dataSource')}</Label>
              <Select value={entity} onValueChange={(v) => changeEntity(v as CardEntity)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARD_ENTITIES.map((e) => (
                    <SelectItem key={e} value={e}>
                      {t(`entities.${e}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('filters')}</Label>
            {filters.map((filter, index) => {
              const def = getField(entity, filter.field)
              return (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    value={filter.field}
                    onValueChange={(v) => updateFilter(index, { field: v })}
                  >
                    <SelectTrigger className="h-9 w-[34%]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fields
                        .filter((f) => f.filterable !== false)
                        .map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {t(`fields.${f.labelKey}`)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filter.operator}
                    onValueChange={(v) => updateFilter(index, { operator: v })}
                  >
                    <SelectTrigger className="h-9 w-[26%]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(def ? OPERATORS_BY_TYPE[def.type] : []).map((op) => (
                        <SelectItem key={op} value={op}>
                          {t(`operators.${op}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex-1">{valueInput(filter, index)}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setFilters(filters.filter((_, i) => i !== index))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
            {filters.length < 8 && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addFilter}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t('addFilter')}
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('columns')}</Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {fields.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={columns.includes(f.id)}
                    onCheckedChange={() => toggleColumn(f.id)}
                  />
                  {t(`fields.${f.labelKey}`)}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('rowLimit')}</Label>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 25].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim() || columns.length === 0}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
