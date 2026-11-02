'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BookOpen } from 'lucide-react'
import { IconActionButton } from '@/components/icon-action-button'
import { Button } from '@/components/ui/button'
import { isRepairDataAvailable } from '@/features/integrations/Actions/repairDataActions'
import { type LaborGuideJob, LaborGuideDialog } from './LaborGuideDialog'

interface LaborGuideButtonProps {
  vehicleId: string
  /** "2018 Ford F-150", shown under the dialog's title. */
  vehicleLabel?: string
  /** Adds a job from the guide as a labor line. */
  onAdd: (job: LaborGuideJob) => void
  /** A labelled button, for toolbars whose other buttons carry their names. */
  labelled?: boolean
}

/**
 * Opens the labor guide for the vehicle on a work order or a quote.
 *
 * Availability is checked here rather than passed in, like the VIN lookup
 * button: the labor editors on both pages render this, and neither should
 * have to know which integrations exist. Nothing shows until a repair data
 * source is connected.
 */
export function LaborGuideButton({
  vehicleId,
  vehicleLabel,
  onAdd,
  labelled = false,
}: LaborGuideButtonProps) {
  const t = useTranslations('service.laborGuide')
  const [available, setAvailable] = useState<{ labor: boolean; fluids: boolean } | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    isRepairDataAvailable().then((res) => {
      if (active) setAvailable(res.success && res.data ? res.data : null)
    })
    return () => {
      active = false
    }
  }, [])

  if (!available || (!available.labor && !available.fluids)) return null

  return (
    <>
      {labelled ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <BookOpen className="mr-1 h-3.5 w-3.5" />
          {t('button')}
        </Button>
      ) : (
        <IconActionButton label={t('button')} icon={BookOpen} onClick={() => setOpen(true)} />
      )}
      {/* Mounted while open only, so each opening asks again and a closed dialog holds nothing. */}
      {open && (
        <LaborGuideDialog
          open={open}
          onOpenChange={setOpen}
          vehicleId={vehicleId}
          vehicleLabel={vehicleLabel}
          available={available}
          onAdd={onAdd}
        />
      )}
    </>
  )
}
