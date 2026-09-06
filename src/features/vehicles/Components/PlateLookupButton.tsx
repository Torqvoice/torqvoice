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

interface PlateLookupButtonProps {
  /** The plate as typed right now; read when the button is pressed. */
  getPlate: () => string
  /** The VIN as typed right now, for registries that answer to a VIN rather than a plate. */
  getVin?: () => string
  /** Called with what the registry knows, for the form to apply. */
  onFound: (data: VehicleLookup) => void
  /** Set when editing, so the answer is also recorded on the vehicle. */
  vehicleId?: string
}

/**
 * Asks the workshop's connected vehicle registry about the plate beside it.
 *
 * Availability is checked here rather than passed in, like the document
 * scanner: three dialogs render this form and none should have to know which
 * registries exist.
 */
export function PlateLookupButton({
  getPlate,
  getVin,
  onFound,
  vehicleId,
}: PlateLookupButtonProps) {
  const t = useTranslations('vehicles.form')
  const [busy, setBusy] = useState(false)
  /** null while the availability check is still in flight. */
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    isVehicleLookupAvailable().then((result) => {
      if (active) setAvailable(result.success && result.data === true)
    })
    return () => {
      active = false
    }
  }, [])

  const handleClick = useCallback(async () => {
    const plate = getPlate().trim()
    const vin = getVin?.().trim() ?? ''
    if (!plate && !vin) {
      toast.error(getVin ? t('lookupEnterPlateOrVin') : t('lookupEnterPlate'))
      return
    }
    setBusy(true)
    const toastId = toast.loading(t('lookingUp'))
    try {
      const result = await lookupVehicle({
        plate: plate || undefined,
        vin: vin || undefined,
        vehicleId,
      })
      if (!result.success) {
        toast.error(result.error || t('lookupFailed'), { id: toastId })
        return
      }
      if (!result.data) {
        toast.error(t('lookupNotFound'), { id: toastId })
        return
      }
      onFound(result.data)
      toast.success(t('lookupSuccess', { source: result.data.source }), { id: toastId })
    } catch {
      toast.error(t('lookupFailed'), { id: toastId })
    } finally {
      setBusy(false)
    }
  }, [getPlate, getVin, onFound, vehicleId, t])

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
            aria-label={t('lookupPlate')}
            onClick={handleClick}
            disabled={busy || !available}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {available === false ? t('lookupUnavailable') : t('lookupPlate')}
      </TooltipContent>
    </Tooltip>
  )
}
