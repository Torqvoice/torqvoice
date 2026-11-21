'use client'

import { type ComponentType, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { BookOpen, ExternalLink, Hash, Ship, Sparkles, Truck } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useServiceType } from '@/components/service-type-context'
import { handleGated } from '@/components/upgrade-gate'
import { useSettingsPermission } from '@/app/(authenticated)/settings/settings-permission-context'
import { setReadyMadeField } from '../Actions/setReadyMadeField'
import type { ReadyMadeField } from '../Lib/readyMadeFields'
import { HEAVY_VEHICLE_DOCS_URL } from '../Lib/settingsPath'

/**
 * The fields that come with Torqvoice, at the top of the Custom Fields tab:
 * Reference / PO and Fleet / unit number. Each switch saves as soon as it is
 * flipped; a save that fails puts it back. Read-only for someone who may not
 * change settings.
 */
export function ReadyMadeFields({ initial }: { initial: Record<ReadyMadeField, boolean> }) {
  const t = useTranslations('settings.customFields.readyMade')
  const isMarine = useServiceType() === 'marine'
  const router = useRouter()
  const { canEdit } = useSettingsPermission()
  const [enabled, setEnabled] = useState(initial)
  const [saving, setSaving] = useState<ReadyMadeField | null>(null)

  const toggle = async (field: ReadyMadeField, on: boolean) => {
    setEnabled((current) => ({ ...current, [field]: on }))
    setSaving(field)
    const result = await setReadyMadeField({ field, enabled: on }).catch(() => null)
    setSaving(null)
    if (!result?.success) {
      setEnabled((current) => ({ ...current, [field]: !on }))
      if (handleGated(result)) return
      toast.error(result?.error || t('failedSave'))
      return
    }
    toast.success(t('saved'))
    // The work order, the vehicle and the designer read the switch from the layout.
    router.refresh()
  }

  const row = (field: ReadyMadeField, switchId: string) => ({
    switchId,
    checked: enabled[field],
    disabled: !canEdit || saving === field,
    onChange: (on: boolean) => void toggle(field, on),
  })

  return (
    <section className="space-y-3" data-testid="ready-made-fields" id="ready-made-fields">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <ul className="divide-y rounded-lg border">
        {/* The ids are where the settings search lands. */}
        <ReadyMadeRow
          id="reference-po"
          icon={Hash}
          title={t('customerReferenceTitle')}
          label={t('customerReferenceEnabled')}
          hint={t('customerReferenceHint')}
          {...row('customerReference', 'customerReferenceEnabled')}
        />
        <ReadyMadeRow
          id="fleet-number"
          icon={isMarine ? Ship : Truck}
          title={t('fleetNumberTitle')}
          label={t(isMarine ? 'fleetNumberEnabledMarine' : 'fleetNumberEnabled')}
          hint={t(isMarine ? 'fleetNumberHintMarine' : 'fleetNumberHint')}
          {...row('fleetNumber', 'fleetNumberEnabled')}
        />
      </ul>
    </section>
  )
}

function ReadyMadeRow({
  id,
  icon: Icon,
  title,
  label,
  hint,
  switchId,
  checked,
  disabled,
  onChange,
}: {
  id: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  label: string
  hint: string
  switchId: string
  checked: boolean
  disabled: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <li id={id} className="scroll-mt-20 space-y-2 px-3 py-3" data-testid={`ready-made-${id}`}>
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        {title}
      </h3>
      <div className="flex items-center justify-between gap-3">
        {/* Long enough to wrap on a phone, so it gets room between its lines. */}
        <Label htmlFor={switchId} className="text-sm font-normal leading-snug">
          {label}
        </Label>
        <Switch
          id={switchId}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-describedby={`${switchId}-hint`}
        />
      </div>
      <p
        id={`${switchId}-hint`}
        className="max-w-3xl text-xs leading-relaxed text-muted-foreground"
      >
        {hint}
      </p>
    </li>
  )
}

/** The guide for fleet and heavy vehicle workshops, one line at the top of the tab. */
export function HeavyVehicleGuideLink() {
  const t = useTranslations('setup.heavyVehicles')
  const isMarine = useServiceType() === 'marine'
  return (
    <a
      href={HEAVY_VEHICLE_DOCS_URL}
      target="_blank"
      rel="noreferrer"
      data-testid="heavy-vehicle-guide"
      className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
    >
      <BookOpen className="h-4 w-4" aria-hidden />
      {t(isMarine ? 'docsMarine' : 'docs')}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  )
}
