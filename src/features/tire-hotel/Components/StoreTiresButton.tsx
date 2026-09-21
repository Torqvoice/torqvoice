'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, Warehouse } from 'lucide-react'
import { CheckInDialog } from './CheckInDialog'
import { PrintLabelsDialog } from './PrintLabelsDialog'
import { getLocationOptions } from '../Actions/storageActions'
import { getCheckInPrices } from '../Actions/tireSetActions'
import type { TreatmentPrices } from '../Lib/treatments'
import type { PickerLocation } from './LocationPicker'

// One object for every render: the dialog resets its form when this prop
// changes, and a fresh literal each time would reset it on every keystroke.
const NO_PRICES = { storagePrice: 0, treatmentPrices: {} }

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
  hasSet,
  canBill,
  imperial,
  thresholds,
}: {
  serviceRecordId: string
  vehicle: Vehicle
  /**
   * The job already has its set, so there is nothing left to offer. The
   * component stays mounted all the same: the label dialog opens at the very
   * moment the job gains its set, and a parent that dropped this component
   * then took the dialog down with it a second after it appeared.
   */
  hasSet: boolean
  /**
   * Whether the job can still take lines. A locked invoice cannot, so the
   * dialog stores the tires without offering to charge for it there.
   */
  canBill: boolean
  imperial: boolean
  /** The workshop's tread limits, passed straight to the check-in form. */
  thresholds?: { summerReplace: number; winterReplace: number; warnMargin: number }
}) {
  const t = useTranslations('tireHotel')
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<PickerLocation[] | null>(null)
  const [prices, setPrices] = useState<{
    storagePrice: number
    treatmentPrices: TreatmentPrices
  } | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const [printing, setPrinting] = useState<{ id: string; quantity: number } | null>(null)

  const handleOpen = async () => {
    if (locations) {
      setCheckingIn(true)
      return
    }
    setLoading(true)
    const [result, priced] = await Promise.all([getLocationOptions(), getCheckInPrices()])
    setLoading(false)
    // Without the prices the panel still works, it just starts empty: the
    // storage fee can be typed, and unpriced prep is never billed anyway.
    setPrices(priced.success && priced.data ? priced.data : null)

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
      {!hasSet && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={handleOpen} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Warehouse className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t('job.storeTires')}
          </Button>
        </div>
      )}

      {locations && (
        <CheckInDialog
          open={checkingIn}
          onOpenChange={setCheckingIn}
          locations={locations}
          vehicles={[vehicle]}
          lockedVehicle={vehicle}
          serviceRecordId={serviceRecordId}
          billing={canBill ? (prices ?? NO_PRICES) : undefined}
          imperial={imperial}
          thresholds={thresholds}
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
