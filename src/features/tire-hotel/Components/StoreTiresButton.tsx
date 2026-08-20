'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, Warehouse } from 'lucide-react'
import { CheckInDialog } from './CheckInDialog'
import { PrintLabelsDialog } from './PrintLabelsDialog'
import { getLocationOptions } from '../Actions/storageActions'
import type { PickerLocation } from './LocationPicker'

type Vehicle = {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  customerId: string | null
}

/**
 * Putting the tires that came off into storage, from the job they came off on.
 *
 * The other direction already worked: check a set in at the tire hotel, then
 * go and find the job to attach it to. That is the wrong way round for the
 * common case. The car is on the ramp, the desk is writing the job, and the
 * winter set is standing in the corner: the question "where do these go"
 * belongs on the job, not three screens away.
 *
 * Shelves load on click rather than with the page. A work order already
 * fetches a great deal, and most work orders have nothing to do with tires.
 */
export function StoreTiresButton({
  serviceRecordId,
  vehicle,
  imperial,
}: {
  serviceRecordId: string
  vehicle: Vehicle
  imperial: boolean
}) {
  const t = useTranslations('tireHotel')
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<PickerLocation[] | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const [printing, setPrinting] = useState<{ id: string; quantity: number } | null>(null)

  const handleOpen = async () => {
    if (locations) {
      setCheckingIn(true)
      return
    }
    setLoading(true)
    const result = await getLocationOptions()
    setLoading(false)

    const rows = result.success && result.data ? result.data : []
    if (rows.length === 0) {
      // Nothing to put them on. Sending the desk into a form whose only
      // required field cannot be filled would waste the trip.
      toast.error(t('checkIn.noLocations'))
      return
    }
    setLocations(rows)
    setCheckingIn(true)
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleOpen} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Warehouse className="mr-1.5 h-3.5 w-3.5" />
        )}
        {t('job.storeTires')}
      </Button>

      {locations && (
        <CheckInDialog
          open={checkingIn}
          onOpenChange={setCheckingIn}
          locations={locations}
          vehicles={[vehicle]}
          lockedVehicle={vehicle}
          serviceRecordId={serviceRecordId}
          imperial={imperial}
          // Straight into the labels, still on the job. The sticker has to go
          // on before the tires reach the shelf, and the desk has a work order
          // half written behind this dialog.
          onCheckedIn={(set) => setPrinting(set)}
        />
      )}

      {printing && (
        <PrintLabelsDialog
          open={!!printing}
          onOpenChange={(next) => !next && setPrinting(null)}
          tireSetId={printing.id}
          quantity={printing.quantity}
        />
      )}
    </>
  )
}
