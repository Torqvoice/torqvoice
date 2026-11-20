'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { JobEquipmentView } from '../Lib/equipment.server'
import { setJobEquipment, setQuoteEquipment } from '../Actions/workOnActions'

/**
 * "Work on": the pieces of equipment a work order or quote is for. Several
 * can be picked, since one visit often covers the crane and the tail lift.
 * Each pick saves on its own, like the reference box beside it, and the
 * page reloads its meters: a job reads the meters of every item it works on.
 * Draws nothing while equipment is off or the vehicle has none.
 */
export function WorkOnPicker({
  target,
  equipment,
  locked = false,
  labelClassName,
}: {
  target: { kind: 'job' | 'quote'; id: string }
  equipment: JobEquipmentView | null | undefined
  locked?: boolean
  labelClassName?: string
}) {
  const t = useTranslations('equipment.workOn')
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(equipment?.selected ?? [])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => setSelected(equipment?.selected ?? []), [equipment?.selected])
  if (!equipment || equipment.items.length === 0) return null

  const toggle = async (itemId: string) => {
    const next = selected.includes(itemId)
      ? selected.filter((id) => id !== itemId)
      : [...selected, itemId]
    const before = selected
    setSelected(next)
    setSaving(true)
    const input = { id: target.id, itemIds: next }
    const result =
      target.kind === 'job' ? await setJobEquipment(input) : await setQuoteEquipment(input)
    setSaving(false)
    if (!result.success) {
      setSelected(before)
      toast.error(result.error || t('saveError'))
      return
    }
    router.refresh()
  }

  const picked = equipment.items.filter((item) => selected.includes(item.id))
  const labelId = `work-on-label-${target.id}`

  return (
    <div className="space-y-1" data-testid="work-on">
      <div className="flex items-start gap-2">
        <span id={labelId} className={cn('pt-1.5', labelClassName)}>
          {t('label')}
        </span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={open}
              aria-labelledby={labelId}
              aria-describedby={`${labelId}-value`}
              disabled={locked}
              className="h-auto min-h-8 max-w-full flex-1 justify-between gap-2 py-1 text-left font-normal"
            >
              <span id={`${labelId}-value`} className="min-w-0 whitespace-normal break-words">
                {picked.length === 0 ? t('none') : picked.map((item) => item.label).join(', ')}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
            <Command>
              {equipment.items.length > 6 && <CommandInput placeholder={t('search')} />}
              <CommandList>
                <CommandEmpty>{t('noMatch')}</CommandEmpty>
                <CommandGroup>
                  {equipment.items.map((item) => {
                    const on = selected.includes(item.id)
                    return (
                      <CommandItem
                        key={item.id}
                        value={`${item.label} ${item.id}`}
                        disabled={saving}
                        onSelect={() => void toggle(item.id)}
                        aria-selected={on}
                        data-testid={`work-on-item-${item.id}`}
                      >
                        <span
                          className={cn(
                            'mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                            on ? 'border-primary bg-primary text-primary-foreground' : 'opacity-60'
                          )}
                          aria-hidden
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 break-words">{item.label}</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
