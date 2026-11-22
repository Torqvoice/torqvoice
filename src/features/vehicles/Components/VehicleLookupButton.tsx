'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { handleGated } from '@/components/upgrade-gate'
import {
  getVehicleLookupAvailability,
  lookupVehicle,
  type VehicleLookup,
  type VehicleLookupAvailability,
} from '@/features/integrations/Actions/vehicleLookupActions'

interface VehicleLookupButtonProps {
  /** Whether this button asks by the plate or by the VIN. */
  by: 'plate' | 'vin'
  /** The plate or VIN as typed right now; read when the button is pressed. */
  getValue: () => string
  /**
   * Called with what the registry knows, for the form to apply, and the
   * plate or VIN it was asked about: read when the button was pressed, not
   * when the answer came, in case the field was retyped meanwhile.
   */
  onFound: (data: VehicleLookup, asked: string) => void
  /** Set when editing, so the answer is also recorded on the vehicle. */
  vehicleId?: string
  /** A short word beside the icon ("Look up", "Decode") where the row has room for it. */
  text?: string
}

/**
 * Asks the workshop's connected vehicle registry about the plate or VIN
 * beside it.
 *
 * Availability is checked here rather than passed in, like the document
 * scanner: three dialogs render this form and none should have to know which
 * registries exist. The plate button stays visible but disabled without a
 * registry, so a workshop learns one can be connected; the VIN button only
 * appears once something that decodes VINs is.
 *
 * The disabled plate button says why on a line of its own, which the row
 * around it wraps under the field (`flex-wrap`): a tooltip on a disabled
 * button never appears on a phone.
 */
export function VehicleLookupButton({
  by,
  getValue,
  onFound,
  vehicleId,
  text,
}: VehicleLookupButtonProps) {
  const t = useTranslations('vehicles.form')
  const [busy, setBusy] = useState(false)
  /** null while the availability check is still in flight. */
  const [availability, setAvailability] = useState<VehicleLookupAvailability | null>(null)
  const available = availability ? availability[by] : null
  const reasonId = useId()

  useEffect(() => {
    let active = true
    getVehicleLookupAvailability().then((result) => {
      if (!active) return
      setAvailability(
        result.success && result.data
          ? result.data
          : { plate: false, vin: false, reason: 'notConnected', canEditSettings: false }
      )
    })
    return () => {
      active = false
    }
  }, [by])

  const handleClick = useCallback(async () => {
    const value = getValue().trim()
    if (!value) {
      toast.error(by === 'vin' ? t('lookupEnterVin') : t('lookupEnterPlate'))
      return
    }
    setBusy(true)
    const toastId = toast.loading(t('lookingUp'))
    try {
      const result = await lookupVehicle({ by, value, vehicleId })
      if (!result.success) {
        toast.error(result.error || t(by === 'vin' ? 'lookupVinFailed' : 'lookupFailed'), {
          id: toastId,
        })
        return
      }
      if (!result.data) {
        toast.error(t(by === 'vin' ? 'lookupVinNotFound' : 'lookupNotFound'), { id: toastId })
        return
      }
      onFound(result.data, value)
      toast.success(t('lookupSuccess', { source: result.data.source }), { id: toastId })
    } catch {
      toast.error(t(by === 'vin' ? 'lookupVinFailed' : 'lookupFailed'), { id: toastId })
    } finally {
      setBusy(false)
    }
  }, [by, getValue, onFound, vehicleId, t])

  if (by === 'vin' && !available) return null

  const label = by === 'vin' ? t('lookupVin') : t('lookupPlate')
  const unavailable = availability !== null && !available
  const button = (
    <Button
      type="button"
      variant="outline"
      size={text ? 'default' : 'icon'}
      aria-label={label}
      aria-describedby={unavailable ? reasonId : undefined}
      data-lookup={by}
      data-busy={busy || undefined}
      onClick={handleClick}
      disabled={busy || !available}
      className={text ? 'gap-1.5 px-3' : undefined}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      {text && <span aria-hidden>{text}</span>}
    </Button>
  )

  if (unavailable && availability) {
    return (
      <>
        {button}
        <p id={reasonId} className="basis-full text-xs text-muted-foreground">
          <LookupUnavailableReason availability={availability} />
        </p>
      </>
    )
  }

  return (
    <Tooltip>
      {/* A disabled button swallows pointer events, so the trigger has to be
          the wrapper rather than the button itself. */}
      <TooltipTrigger asChild>
        <span className="block">{button}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const linkClass = 'font-medium text-primary underline-offset-2 hover:underline'

/**
 * Why the plate lookup is off, with the way to switch it on for whoever may:
 * the registry connectors in the integrations catalog, or the plans when the
 * plan leaves integrations out. No registry is named, since which one fits
 * depends on the country. Someone who cannot change settings gets the reason
 * alone.
 */
function LookupUnavailableReason({ availability }: { availability: VehicleLookupAvailability }) {
  const t = useTranslations('vehicles.form')
  const ts = useTranslations('common.shared')
  const { reason, canEditSettings } = availability
  if (reason === 'notInPlan') {
    return (
      <>
        {t('lookupNotInPlan')}
        {canEditSettings && (
          <>
            {' '}
            <button
              type="button"
              className={linkClass}
              onClick={() => handleGated({ gated: { feature: 'integrations' } })}
            >
              {ts('viewPlans')}
            </button>
          </>
        )}
      </>
    )
  }
  if (!canEditSettings) return <>{t('lookupNeedsRegistryAsk')}</>
  return (
    <>
      {t('lookupNeedsRegistry')}{' '}
      <Link href="/settings/integrations?category=registry" className={linkClass}>
        {t('lookupConnectRegistry')}
      </Link>
    </>
  )
}
