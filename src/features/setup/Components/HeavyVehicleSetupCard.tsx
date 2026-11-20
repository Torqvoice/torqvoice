'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { CheckCircle2, Circle, ExternalLink, Truck, Ship, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useServiceType } from '@/components/service-type-context'
import { handleGated } from '@/components/upgrade-gate'
import { cn } from '@/lib/utils'
import type { HeavyVehicleSetupState } from '../Lib/heavyVehicleSetup.server'
import {
  dismissHeavyVehicleSetup,
  openHeavyVehicleSetup,
} from '../Actions/heavyVehicleSetupActions'

/** The docs page the checklist points to; the docs are written in every language at this one address. */
export const HEAVY_VEHICLE_DOCS_URL = 'https://torqvoice.com/docs/heavy-vehicles'

export const HEAVY_VEHICLE_SETUP_ANCHOR = 'heavy-vehicle-setup'

/**
 * The fleet and heavy vehicle setup checklist on Settings, Custom Fields:
 * the five optional parts such a workshop turns on, each saying whether it is
 * on already and linking straight to its switch. Shown only after the
 * workshop asked for it; dismissed, it is gone until asked for again.
 */
export function HeavyVehicleSetupCard({ state }: { state: HeavyVehicleSetupState }) {
  const t = useTranslations('setup.heavyVehicles')
  const isMarine = useServiceType() === 'marine'
  const router = useRouter()
  const [closing, setClosing] = useState(false)

  const steps: { key: keyof HeavyVehicleSetupState; href: string; title: string; hint: string }[] =
    [
      {
        key: 'reference',
        href: '/settings/workshop#customerReferenceEnabled',
        title: t('referenceTitle'),
        hint: t('referenceHint'),
      },
      {
        key: 'fleetNumber',
        href: '/settings/workshop#fleetNumberEnabled',
        title: t('fleetNumberTitle'),
        hint: t(isMarine ? 'fleetNumberHintMarine' : 'fleetNumberHint'),
      },
      {
        key: 'customFields',
        href: '/settings/custom-fields#custom-fields',
        title: t('customFieldsTitle'),
        hint: t(isMarine ? 'customFieldsHintMarine' : 'customFieldsHint'),
      },
      {
        key: 'meters',
        href: '/settings/custom-fields#meters',
        title: t('metersTitle'),
        hint: t('metersHint'),
      },
      {
        key: 'equipment',
        href: '/settings/custom-fields#equipment',
        title: t('equipmentTitle'),
        hint: t(isMarine ? 'equipmentHintMarine' : 'equipmentHint'),
      },
    ]
  const done = steps.filter((step) => state[step.key]).length

  const dismiss = async () => {
    setClosing(true)
    const result = await dismissHeavyVehicleSetup()
    setClosing(false)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    router.refresh()
  }

  const Icon = isMarine ? Ship : Truck
  return (
    <Card
      id={HEAVY_VEHICLE_SETUP_ANCHOR}
      className="scroll-mt-20 py-0"
      data-testid="heavy-vehicle-setup"
      aria-labelledby="heavy-vehicle-setup-title"
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id="heavy-vehicle-setup-title" className="text-sm font-semibold">
              {t(isMarine ? 'titleMarine' : 'title')}
            </h2>
            <p className="text-sm text-muted-foreground">{t(isMarine ? 'introMarine' : 'intro')}</p>
            <p className="text-xs text-muted-foreground" data-testid="heavy-vehicle-setup-progress">
              {t('progress', { done, total: steps.length })}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={dismiss}
            disabled={closing}
            aria-label={t('dismiss')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ol className="divide-y rounded-lg border">
          {steps.map((step) => {
            const on = state[step.key]
            return (
              <li key={step.key} data-testid={`heavy-vehicle-step-${step.key}`}>
                <Link
                  href={step.href}
                  className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  {on ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{step.title}</span>
                    <span className="block text-xs text-muted-foreground">{step.hint}</span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-xs',
                      on ? 'text-muted-foreground' : 'font-medium text-primary'
                    )}
                  >
                    {on ? t('done') : t('turnOn')}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>

        <a
          href={HEAVY_VEHICLE_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
        >
          {t('docs')}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </CardContent>
    </Card>
  )
}

/**
 * Opens the checklist: from the search palette and from the link at the foot
 * of Settings, Custom Fields. A plan without custom fields gets the upgrade
 * dialog instead.
 */
export function useOpenHeavyVehicleSetup() {
  const t = useTranslations('setup.heavyVehicles')
  const router = useRouter()
  return async () => {
    const result = await openHeavyVehicleSetup()
    if (handleGated(result)) return
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    router.push(`/settings/custom-fields#${HEAVY_VEHICLE_SETUP_ANCHOR}`)
    router.refresh()
  }
}

/**
 * The quiet way in on Settings, Custom Fields: one line at the foot of the
 * page, so it moves nothing above it. Hidden while the checklist is open.
 */
export function HeavyVehicleSetupLink() {
  const t = useTranslations('setup.heavyVehicles')
  const isMarine = useServiceType() === 'marine'
  const open = useOpenHeavyVehicleSetup()
  const [busy, setBusy] = useState(false)
  return (
    <p className="text-sm text-muted-foreground" data-testid="heavy-vehicle-setup-link">
      {t(isMarine ? 'linkLeadMarine' : 'linkLead')}{' '}
      <button
        type="button"
        className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await open()
          setBusy(false)
        }}
      >
        {t('linkAction')}
      </button>
    </p>
  )
}
