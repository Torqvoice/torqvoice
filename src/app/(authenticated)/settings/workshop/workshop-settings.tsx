'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { UnitCombobox } from '@/features/inventory/Components/UnitCombobox'
import { AppCard } from '@/components/app-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { assignTechToUnassignedWorkOrders } from '@/features/workboard/Actions/technicianActions'
import {
  Loader2,
  Percent,
  Ruler,
  Save,
  Wrench,
  Check,
  ChevronsUpDown,
  Plus,
  Tag,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createTechnician } from '@/features/workboard/Actions/technicianActions'
import { cn } from '@/lib/utils'
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from '../read-only-guard'
import {
  DEFAULT_WORK_ORDER_TITLE_TEMPLATE,
  MAX_WORK_ORDER_TITLE_TEMPLATE_LENGTH,
  resolveWorkOrderTitle,
  SAMPLE_WORK_ORDER_TITLE_VALUES,
  unknownTokensIn,
  WORK_ORDER_TITLE_TOKENS,
} from '@/features/vehicles/Lib/workOrderTitle'
import { ServiceTypeSelector } from '../company/service-type-selector'

interface TechnicianOption {
  id: string
  name: string
}

export function WorkshopSettings({
  settings,
  technicians: initialTechnicians = [],
}: {
  settings: Record<string, string>
  technicians?: TechnicianOption[]
}) {
  const router = useRouter()
  const t = useTranslations('settings')
  const [saving, setSaving] = useState(false)
  const [serviceType, setServiceType] = useState(
    settings[SETTING_KEYS.SERVICE_TYPE] || 'automotive'
  )

  const [defaultTechnicianId, setDefaultTechnicianId] = useState(
    settings[SETTING_KEYS.DEFAULT_TECHNICIAN_ID] || ''
  )
  const [technicians, setTechnicians] = useState<TechnicianOption[]>(initialTechnicians)
  const [techOpen, setTechOpen] = useState(false)
  const [techSearch, setTechSearch] = useState('')
  const [creatingTech, setCreatingTech] = useState(false)
  const [showNewInput, setShowNewInput] = useState(false)
  const [newTechName, setNewTechName] = useState('')
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  const [pendingTechId, setPendingTechId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [defaultLaborRate, setDefaultLaborRate] = useState(
    settings[SETTING_KEYS.DEFAULT_LABOR_RATE] || ''
  )
  const [unitSystem, setUnitSystem] = useState(settings[SETTING_KEYS.UNIT_SYSTEM] || 'imperial')
  const [defaultUnit, setDefaultUnit] = useState(
    settings[SETTING_KEYS.INVENTORY_DEFAULT_UNIT] || ''
  )
  const [workDayStart, setWorkDayStart] = useState(
    settings[SETTING_KEYS.WORKBOARD_WORK_DAY_START] || '07:00'
  )
  // Unset means the default; a template saved empty means the plain name,
  // so the two are kept apart here rather than folded into one falsy value.
  const [titleTemplate, setTitleTemplate] = useState(
    settings[SETTING_KEYS.WORK_ORDER_TITLE_TEMPLATE] ?? DEFAULT_WORK_ORDER_TITLE_TEMPLATE
  )
  const titleTemplateInput = useRef<HTMLInputElement>(null)
  const insertTitleTag = (token: string) => {
    const tag = `{${token}}`
    const input = titleTemplateInput.current
    const at = input?.selectionStart ?? titleTemplate.length
    const before = titleTemplate.slice(0, at)
    const after = titleTemplate.slice(input?.selectionEnd ?? at)
    // A space between two tags typed back to back, so "{a}{b}" does not
    // print two values glued together.
    const glue = before && !/\s$/.test(before) && !after.startsWith(' ') ? ' ' : ''
    const next = `${before}${glue}${tag}${after}`.slice(0, MAX_WORK_ORDER_TITLE_TEMPLATE_LENGTH)
    setTitleTemplate(next)
    requestAnimationFrame(() => {
      input?.focus()
      const caret = Math.min(next.length, before.length + glue.length + tag.length)
      input?.setSelectionRange(caret, caret)
    })
  }
  const titlePreview = resolveWorkOrderTitle(titleTemplate, SAMPLE_WORK_ORDER_TITLE_VALUES)
  const unknownTitleTags = unknownTokensIn(titleTemplate)
  const [workDayEnd, setWorkDayEnd] = useState(
    settings[SETTING_KEYS.WORKBOARD_WORK_DAY_END] || '15:00'
  )
  const [defaultMarkupPercent, setDefaultMarkupPercent] = useState(
    settings[SETTING_KEYS.PARTS_DEFAULT_MARKUP_PERCENT] || '0'
  )
  const [markupAppliesToInventory, setMarkupAppliesToInventory] = useState(
    settings[SETTING_KEYS.PARTS_MARKUP_APPLIES_TO_INVENTORY] === 'true'
  )

  const selectedTechName = technicians.find((t) => t.id === defaultTechnicianId)?.name || ''

  const handleTechSelect = (techId: string) => {
    setDefaultTechnicianId(techId)
    setTechOpen(false)
    if (techId) {
      setPendingTechId(techId)
      setShowAssignDialog(true)
    }
  }

  const handleAssignUnassigned = async () => {
    if (!pendingTechId) return
    setAssigning(true)
    const result = await assignTechToUnassignedWorkOrders(pendingTechId)
    setAssigning(false)
    setShowAssignDialog(false)
    setPendingTechId(null)
    if (result.success && result.data) {
      toast.success(t('workshop.assignedUnassigned', { count: result.data.updated }))
    } else {
      toast.error(result.error || t('workshop.assignFailed'))
    }
  }

  const doCreateTechnician = async (name: string) => {
    if (!name.trim()) return
    setCreatingTech(true)
    const res = await createTechnician({ name: name.trim() })
    setCreatingTech(false)
    if (res.success && res.data) {
      const newTech = { id: res.data.id, name: res.data.name }
      setTechnicians((prev) => [...prev, newTech])
      setTechSearch('')
      setNewTechName('')
      setShowNewInput(false)
      handleTechSelect(newTech.id)
    } else {
      toast.error(t('workshop.failedCreateTech'))
    }
  }

  const searchLower = techSearch.toLowerCase()
  const exactMatch = technicians.some((tech) => tech.name.toLowerCase() === searchLower)

  const handleSave = async () => {
    setSaving(true)
    await setSettings({
      [SETTING_KEYS.SERVICE_TYPE]: serviceType,
      [SETTING_KEYS.DEFAULT_TECHNICIAN_ID]: defaultTechnicianId,
      [SETTING_KEYS.DEFAULT_TECHNICIAN]: selectedTechName,
      [SETTING_KEYS.DEFAULT_LABOR_RATE]: defaultLaborRate,
      [SETTING_KEYS.UNIT_SYSTEM]: unitSystem,
      [SETTING_KEYS.INVENTORY_DEFAULT_UNIT]: defaultUnit.trim(),
      [SETTING_KEYS.WORKBOARD_WORK_DAY_START]: workDayStart,
      [SETTING_KEYS.WORKBOARD_WORK_DAY_END]: workDayEnd,
      [SETTING_KEYS.WORK_ORDER_TITLE_TEMPLATE]: titleTemplate.trim(),
      [SETTING_KEYS.PARTS_DEFAULT_MARKUP_PERCENT]: defaultMarkupPercent,
      [SETTING_KEYS.PARTS_MARKUP_APPLIES_TO_INVENTORY]: markupAppliesToInventory ? 'true' : 'false',
    })
    setSaving(false)
    router.refresh()
    toast.success(t('workshop.saved'))
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <ServiceTypeSelector serviceType={serviceType} onServiceTypeChange={setServiceType} />
        <AppCard icon={Wrench} title={t('workshop.title')} contentClassName="space-y-6">
          <p className="text-sm text-muted-foreground">{t('workshop.description')}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('workshop.defaultTechnician')}</Label>
              <Popover open={techOpen} onOpenChange={setTechOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={techOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedTechName || t('workshop.technicianPlaceholder')}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={true}>
                    <CommandInput
                      placeholder={t('workshop.technicianPlaceholder')}
                      value={techSearch}
                      onValueChange={setTechSearch}
                    />
                    <CommandList className="max-h-60 overflow-y-auto">
                      <CommandEmpty className="p-0" />
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => {
                            setDefaultTechnicianId('')
                            setTechOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              !defaultTechnicianId ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <span className="text-muted-foreground">
                            {t('workshop.noTechnician')}
                          </span>
                        </CommandItem>
                        {technicians.map((tech) => (
                          <CommandItem
                            key={tech.id}
                            value={tech.name}
                            onSelect={() => handleTechSelect(tech.id)}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                defaultTechnicianId === tech.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            {tech.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      {techSearch.trim() && !exactMatch && (
                        <CommandGroup>
                          <CommandItem
                            value={`__create__${techSearch}`}
                            onSelect={() => doCreateTechnician(techSearch)}
                            disabled={creatingTech}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            {creatingTech
                              ? t('workshop.creating')
                              : t('workshop.createTechnician', { name: techSearch.trim() })}
                          </CommandItem>
                        </CommandGroup>
                      )}
                      <CommandSeparator />
                      <CommandGroup>
                        {showNewInput ? (
                          <div
                            className="flex items-center gap-1.5 px-2 py-1.5"
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <Input
                              autoFocus
                              placeholder={t('workshop.newTechPlaceholder')}
                              value={newTechName}
                              onChange={(e) => setNewTechName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  doCreateTechnician(newTechName)
                                }
                                if (e.key === 'Escape') {
                                  setShowNewInput(false)
                                  setNewTechName('')
                                }
                              }}
                              className="h-7 text-sm"
                              disabled={creatingTech}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 shrink-0"
                              disabled={creatingTech || !newTechName.trim()}
                              onClick={() => doCreateTechnician(newTechName)}
                            >
                              {creatingTech ? t('workshop.creating') : t('workshop.addTech')}
                            </Button>
                          </div>
                        ) : (
                          <CommandItem value="__add_new__" onSelect={() => setShowNewInput(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t('workshop.addNewTech')}
                          </CommandItem>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultLaborRate">{t('workshop.defaultLaborRate')}</Label>
              <Input
                id="defaultLaborRate"
                type="number"
                placeholder={t('workshop.laborRatePlaceholder')}
                value={defaultLaborRate}
                onChange={(e) => setDefaultLaborRate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="workDayStart">{t('workshop.workDayStart')}</Label>
              <Input
                id="workDayStart"
                type="time"
                value={workDayStart}
                onChange={(e) => setWorkDayStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workDayEnd">{t('workshop.workDayEnd')}</Label>
              <Input
                id="workDayEnd"
                type="time"
                value={workDayEnd}
                onChange={(e) => setWorkDayEnd(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* What a job is called before anybody types a title. Resolved on
              the server when the draft is made, so the preview here uses
              sample values; the rules are in workOrderTitle.ts. */}
          <div className="space-y-4">
            <div className="flex flex-row items-center gap-3">
              <Tag className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">{t('workshop.titleTemplateTitle')}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('workshop.titleTemplateDescription')}
            </p>
            <div className="space-y-2">
              <Label htmlFor="workOrderTitleTemplate">{t('workshop.titleTemplate')}</Label>
              <Input
                id="workOrderTitleTemplate"
                ref={titleTemplateInput}
                value={titleTemplate}
                maxLength={MAX_WORK_ORDER_TITLE_TEMPLATE_LENGTH}
                placeholder={t('workshop.titleTemplatePlaceholder')}
                autoComplete="off"
                onChange={(e) => setTitleTemplate(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                {WORK_ORDER_TITLE_TOKENS.map((token) => (
                  <Button
                    key={token}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 font-mono text-xs"
                    data-testid={`work-order-title-tag-${token}`}
                    title={t(`workshop.titleTemplateTags.${token}`)}
                    onClick={() => insertTitleTag(token)}
                  >
                    {`{${token}}`}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t('workshop.titleTemplateHint')}</p>
              <p className="text-sm" data-testid="work-order-title-preview">
                {t('workshop.titleTemplatePreview', { title: titlePreview })}
              </p>
              {unknownTitleTags.length > 0 && (
                <p className="text-xs text-destructive" data-testid="work-order-title-unknown">
                  {t('workshop.titleTemplateUnknown', { tags: unknownTitleTags.join(', ') })}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Pricing, not paperwork: the markup decides what a part costs the
              customer, which is settled here on the job, long before an
              invoice exists. */}
          <div className="space-y-4">
            <div className="flex flex-row items-center gap-3">
              <Percent className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">{t('workshop.partsMarkupTitle')}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{t('workshop.partsMarkupDescription')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="defaultMarkupPercent">{t('workshop.defaultMarkupPercent')}</Label>
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
                <p className="text-sm text-muted-foreground">
                  {t('workshop.defaultMarkupPercentHint')}
                </p>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="markupAppliesToInventory"
                  className="flex items-center justify-between gap-3"
                >
                  <span>{t('workshop.markupAppliesToInventory')}</span>
                  <Switch
                    id="markupAppliesToInventory"
                    checked={markupAppliesToInventory}
                    onCheckedChange={setMarkupAppliesToInventory}
                  />
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('workshop.markupAppliesToInventoryHint')}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex flex-row items-center gap-3">
              <Ruler className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">{t('workshop.unitsTitle')}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{t('workshop.unitsDescription')}</p>

            <div className="space-y-2">
              <Label htmlFor="unitSystem">{t('workshop.unitSystem')}</Label>
              <Select value={unitSystem} onValueChange={setUnitSystem}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="metric">{t('workshop.metric')}</SelectItem>
                  <SelectItem value="imperial">{t('workshop.imperial')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              {unitSystem === 'metric' ? (
                <div className="space-y-1">
                  <p>
                    {t('workshop.distanceLabel')}:{' '}
                    <span className="font-medium text-foreground">{t('workshop.kilometers')}</span>
                  </p>
                  <p>
                    {t('workshop.volumeLabel')}:{' '}
                    <span className="font-medium text-foreground">{t('workshop.liters')}</span>
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p>
                    {t('workshop.distanceLabel')}:{' '}
                    <span className="font-medium text-foreground">{t('workshop.miles')}</span>
                  </p>
                  <p>
                    {t('workshop.volumeLabel')}:{' '}
                    <span className="font-medium text-foreground">{t('workshop.gallons')}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultUnit">{t('workshop.defaultStockUnit')}</Label>
              {/* Suggestions follow the (unsaved) system picked above, so
                  switching to imperial immediately offers qt/gal/lb. */}
              <UnitCombobox
                id="defaultUnit"
                className="w-48"
                value={defaultUnit}
                onChange={setDefaultUnit}
                unitSystem={unitSystem}
              />
              <p className="text-sm text-muted-foreground">{t('workshop.defaultStockUnitHint')}</p>
            </div>
          </div>

          <SaveButton>
            <Separator />
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('workshop.saveWorkshop')}
              </Button>
            </div>
          </SaveButton>
        </AppCard>
      </ReadOnlyWrapper>

      <AlertDialog
        open={showAssignDialog}
        onOpenChange={(open) => {
          if (!open) setPendingTechId(null)
          setShowAssignDialog(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workshop.assignDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('workshop.assignDialogDescription', {
                name: technicians.find((tech) => tech.id === pendingTechId)?.name || '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('workshop.assignDialogSkip')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleAssignUnassigned} disabled={assigning}>
              {assigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('workshop.assignDialogConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
