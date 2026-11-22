'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { handleGated } from '@/components/upgrade-gate'
import { Loader2, ScanLine } from 'lucide-react'
import {
  aiAnalyzeVehicleDocument,
  getVehicleScanAvailability,
  type VehicleDocumentScan,
  type VehicleScanAvailability,
} from '../Actions/aiAnalyzeVehicleDocument'
import { documentToDataUri } from '../Lib/documentImage'
import { cn } from '@/lib/utils'

interface ScanDocumentButtonProps {
  /** Called with whatever the papers yielded, for the form to apply. */
  onScanned: (data: VehicleDocumentScan) => void
  /** Hidden when the surrounding form has no room for a second line. */
  showHint?: boolean
  /** The hint under the button rather than beside it, for a narrow column. */
  stacked?: boolean
}

/**
 * Reads a registration document and hands the result to the form around it.
 *
 * Shared by the vehicle and customer dialogs: the same photo carries the
 * vehicle's details and its keeper, so both forms have something to fill from
 * it and neither should own the scanning.
 */
export function ScanDocumentButton({
  onScanned,
  showHint = true,
  stacked = false,
}: ScanDocumentButtonProps) {
  const t = useTranslations('vehicles.form')
  const [scanning, setScanning] = useState(false)
  /** null while the availability check is still in flight. */
  const [availability, setAvailability] = useState<VehicleScanAvailability | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reasonId = useId()
  const available = availability ? availability.available : null

  // Scanning needs an AI provider configured for the organization. Checked
  // here rather than passed in, so no call site has to thread it down.
  useEffect(() => {
    let active = true
    getVehicleScanAvailability().then((result) => {
      if (!active) return
      setAvailability(
        result.success && result.data
          ? result.data
          : { available: false, reason: 'notConfigured', canEditSettings: false }
      )
    })
    return () => {
      active = false
    }
  }, [])

  const handleSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return

      setScanning(true)
      const toastId = toast.loading(t('scanningDocument'))
      try {
        const dataUri = await documentToDataUri(file)
        const result = await aiAnalyzeVehicleDocument(dataUri)
        if (!result.success || !result.data) {
          toast.error(result.error || t('scanFailed'), { id: toastId })
          return
        }
        onScanned(result.data)
        toast.success(t('scanSuccess'), { id: toastId })
      } catch {
        toast.error(t('scanFailed'), { id: toastId })
      } finally {
        setScanning(false)
      }
    },
    [onScanned, t]
  )

  return (
    <div
      className={
        stacked ? 'flex flex-col gap-2' : 'flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3'
      }
    >
      <Button
        type="button"
        variant="outline"
        className={stacked ? 'w-full' : 'w-full sm:w-auto'}
        onClick={() => inputRef.current?.click()}
        disabled={scanning || !available}
        aria-describedby={available === false ? reasonId : undefined}
      >
        {scanning ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ScanLine className="mr-2 h-4 w-4" />
        )}
        {t('scanDocument')}
      </Button>
      {/* Unavailable: the reason takes the hint's place, in plain sight. A
          tooltip on a disabled button never shows on a phone, and the hint
          would promise fields that cannot fill. */}
      {availability && !availability.available ? (
        <p
          id={reasonId}
          className={cn('text-xs text-muted-foreground', stacked ? 'leading-snug' : 'sm:flex-1')}
        >
          <ScanUnavailableReason availability={availability} />
        </p>
      ) : (
        showHint && (
          <p
            className={cn('text-xs text-muted-foreground', stacked ? 'leading-snug' : 'sm:flex-1')}
          >
            {t('scanDocumentHint')}
          </p>
        )
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={handleSelect}
        className="hidden"
      />
    </div>
  )
}

const linkClass = 'font-medium text-primary underline-offset-2 hover:underline'

/**
 * Why scanning is off, with the way to switch it on for whoever may: the AI
 * providers in the integrations catalog, or the plans when the plan is what
 * leaves it out. Someone who cannot change settings gets the reason alone.
 */
function ScanUnavailableReason({ availability }: { availability: VehicleScanAvailability }) {
  const t = useTranslations('vehicles.form')
  const ts = useTranslations('common.shared')
  const { reason, canEditSettings } = availability
  if (reason === 'notInPlan') {
    return (
      <>
        {t('scanNotInPlan')}
        {canEditSettings && (
          <>
            {' '}
            <button
              type="button"
              className={linkClass}
              onClick={() => handleGated({ gated: { feature: 'ai' } })}
            >
              {ts('viewPlans')}
            </button>
          </>
        )}
      </>
    )
  }
  if (!canEditSettings) return <>{t('scanNeedsAiAsk')}</>
  return (
    <>
      {t('scanNeedsAi')}{' '}
      <Link href="/settings/integrations?category=ai" className={linkClass}>
        {t('scanSetUpAi')}
      </Link>
    </>
  )
}
