'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Loader2, ScanLine } from 'lucide-react'
import {
  aiAnalyzeVehicleDocument,
  isVehicleScanAvailable,
  type VehicleDocumentScan,
} from '../Actions/aiAnalyzeVehicleDocument'
import { documentToDataUri } from '../Lib/documentImage'

interface ScanDocumentButtonProps {
  /** Called with whatever the papers yielded, for the form to apply. */
  onScanned: (data: VehicleDocumentScan) => void
  /** Hidden when the surrounding form has no room for a second line. */
  showHint?: boolean
}

/**
 * Reads a registration document and hands the result to the form around it.
 *
 * Shared by the vehicle and customer dialogs: the same photo carries the
 * vehicle's details and its keeper, so both forms have something to fill from
 * it and neither should own the scanning.
 */
export function ScanDocumentButton({ onScanned, showHint = true }: ScanDocumentButtonProps) {
  const t = useTranslations('vehicles.form')
  const [scanning, setScanning] = useState(false)
  /** null while the availability check is still in flight. */
  const [available, setAvailable] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scanning needs an AI provider configured for the organization. Checked
  // here rather than passed in, so no call site has to thread it down.
  useEffect(() => {
    let active = true
    isVehicleScanAvailable().then((result) => {
      if (active) setAvailable(result.success && result.data === true)
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
    <div className="space-y-1">
      <Tooltip>
        {/* A disabled button swallows pointer events, so the trigger has to be
            the wrapper rather than the button itself. */}
        <TooltipTrigger asChild>
          <span className="block">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => inputRef.current?.click()}
              disabled={scanning || !available}
            >
              {scanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="mr-2 h-4 w-4" />
              )}
              {t('scanDocument')}
            </Button>
          </span>
        </TooltipTrigger>
        {available === false && <TooltipContent>{t('scanUnavailable')}</TooltipContent>}
      </Tooltip>
      {showHint && <p className="text-xs text-muted-foreground">{t('scanDocumentHint')}</p>}
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
