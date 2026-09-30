'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  isVehicleLookupAvailable,
  lookupVehicle,
  type VehicleLookup,
} from '@/features/integrations/Actions/vehicleLookupActions'

interface VehicleLookupButtonProps {
  /** Whether this button asks by the plate or by the VIN. */
  by: 'plate' | 'vin'
  /** The plate or VIN as typed right now; read when the button is pressed. */
  getValue: () => string
  /** Called with what the registry knows, for the form to apply. */
  onFound: (data: VehicleLookup) => void
  /** Set when editing, so the answer is also recorded on the vehicle. */
  vehicleId?: string
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
 */
export function VehicleLookupButton({ by, getValue, onFound, vehicleId }: VehicleLookupButtonProps) {
  const t = useTranslations('vehicles.form')
  const [busy, setBusy] = useState(false)
  /** null while the availability check is still in flight. */
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    isVehicleLookupAvailable().then((result) => {
      if (active) setAvailable(result.success && result.data?.[by] === true)
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
      onFound(result.data)
      toast.success(t('lookupSuccess', { source: result.data.source }), { id: toastId })
    } catch {
      toast.error(t(by === 'vin' ? 'lookupVinFailed' : 'lookupFailed'), { id: toastId })
    } finally {
      setBusy(false)
    }
  }, [by, getValue, onFound, vehicleId, t])

  if (by === 'vin' && !available) return null

  const label = by === 'vin' ? t('lookupVin') : t('lookupPlate')
  return (
    <Tooltip>
      {/* A disabled button swallows pointer events, so the trigger has to be
          the wrapper rather than the button itself. */}
      <TooltipTrigger asChild>
        <span className="block">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={label}
            onClick={handleClick}
            disabled={busy || !available}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{available === false ? t('lookupUnavailable') : label}</TooltipContent>
    </Tooltip>
  )
}
