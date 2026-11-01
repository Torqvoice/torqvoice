'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Camera, CameraOff, Keyboard, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface BarcodeScannerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (barcode: string) => void
  title?: string
}

/** Why the camera is not showing: each has its own sentence and way forward. */
type CameraProblem = 'denied' | 'insecure' | 'notFound' | 'failed'

/** html5-qrcode rejects with a sentence string; the browser with a DOMException. */
function describeError(err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const { name, message } = err as { name?: unknown; message?: unknown }
    return `${typeof name === 'string' ? name : ''} ${typeof message === 'string' ? message : ''}`
  }
  return String(err)
}

function problemOf(err: unknown): CameraProblem {
  const text = describeError(err)
  if (/NotAllowedError|Permission|denied/i.test(text)) return 'denied'
  if (/NotFoundError|DevicesNotFound|Requested device not found/i.test(text)) return 'notFound'
  return 'failed'
}

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  title = 'Scan Barcode',
}: BarcodeScannerDialogProps) {
  const t = useTranslations('common.shared')
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrRef = useRef<any>(null)
  const [problem, setProblem] = useState<CameraProblem | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const hasScannedRef = useRef(false)
  // The one restart the dialog makes by itself each time it opens; see below.
  const autoRetriedRef = useRef(false)

  const scanBufferRef = useRef<string[]>([])
  const REQUIRED_CONSISTENT_READS = 3

  const accept = useCallback(
    (code: string) => {
      if (hasScannedRef.current) return
      hasScannedRef.current = true
      scanBufferRef.current = []
      onScan(code)
      onOpenChange(false)
    },
    [onScan, onOpenChange]
  )

  // The camera has to read the same code a few frames in a row before it
  // counts; a typed code is taken as it is.
  const handleScan = useCallback(
    (decodedText: string) => {
      if (hasScannedRef.current) return

      const buffer = scanBufferRef.current
      if (buffer.length > 0 && buffer[buffer.length - 1] !== decodedText) {
        // Different barcode read — reset the buffer
        scanBufferRef.current = [decodedText]
        return
      }

      buffer.push(decodedText)
      if (buffer.length < REQUIRED_CONSISTENT_READS) return
      accept(decodedText)
    },
    [accept]
  )

  const retryCamera = useCallback(() => {
    setProblem(null)
    setShowManual(false)
  }, [])

  useEffect(() => {
    if (!open || showManual) {
      hasScannedRef.current = false
      if (!open) autoRetriedRef.current = false
      return
    }

    // Browsers only hand out the camera on HTTPS or localhost; asking would
    // only fail, so say why straight away.
    if (!window.isSecureContext) {
      setProblem('insecure')
      setShowManual(true)
      return
    }

    let scanner: any = null
    let mounted = true
    scanBufferRef.current = []

    const startScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')

        if (!mounted || !scannerRef.current) return

        const containerId = 'barcode-scanner-region'
        if (!document.getElementById(containerId)) {
          const div = document.createElement('div')
          div.id = containerId
          scannerRef.current.appendChild(div)
        }

        scanner = new Html5Qrcode(containerId, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        })
        html5QrRef.current = scanner

        const scanConfig = {
          fps: 10,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
            width: Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.8),
            height: Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.3),
          }),
        }
        const onSuccess = (decodedText: string) => {
          if (mounted) handleScan(decodedText)
        }
        const onError = () => {
          /* expected: fires on each frame without a match */
        }

        try {
          // Try rear camera first (mobile)
          await scanner.start({ facingMode: 'environment' }, scanConfig, onSuccess, onError)
        } catch (first) {
          // A refused camera stays refused: asking again for any camera would
          // only show the browser's prompt, or its refusal, a second time.
          if (problemOf(first) === 'denied') throw first
          // Fall back to any available camera (desktop USB/webcam)
          const devices = await Html5Qrcode.getCameras()
          if (!devices.length) throw new Error('NotFoundError')
          await scanner.start(devices[0].id, scanConfig, onSuccess, onError)
        }
      } catch (err: unknown) {
        if (!mounted) return
        const found = problemOf(err)
        // A refused or missing camera is the person's setup, not a fault.
        if (found === 'failed') console.error('[BarcodeScan] Camera error:', describeError(err))
        else console.warn('[BarcodeScan] Camera unavailable:', describeError(err))
        setProblem(found)
        setShowManual(true)
      }
    }

    const timer = setTimeout(startScanner, 100)

    return () => {
      mounted = false
      clearTimeout(timer)
      const inst = html5QrRef.current
      html5QrRef.current = null
      if (inst) {
        const state = inst.getState?.()
        // State 2 = SCANNING, State 3 = PAUSED
        if (state === 2 || state === 3) {
          inst
            .stop()
            .then(() => inst.clear())
            .catch(() => {
              /* scanner already stopped */
            })
        }
      }
    }
  }, [open, showManual, handleScan])

  // Allowing the camera in the browser while the dialog is open starts it,
  // where the browser says so (the Permissions API is not everywhere). Allowed
  // already by the time the answer comes counts as well. Once per opening: the
  // browser can allow a camera the system still refuses (macOS privacy
  // settings), and restarting on every refusal would go round in circles.
  // Try again is always there for a second go.
  useEffect(() => {
    if (!open || problem !== 'denied' || !navigator.permissions?.query) return
    let status: PermissionStatus | null = null
    let cancelled = false
    const restartIfAllowed = () => {
      if (cancelled || status?.state !== 'granted' || autoRetriedRef.current) return
      autoRetriedRef.current = true
      retryCamera()
    }
    navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then((s) => {
        if (cancelled) return
        status = s
        s.addEventListener('change', restartIfAllowed)
        restartIfAllowed()
      })
      .catch(() => {
        /* this browser cannot be asked about the camera */
      })
    return () => {
      cancelled = true
      status?.removeEventListener('change', restartIfAllowed)
    }
  }, [open, problem, retryCamera])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualValue.trim()
    if (trimmed) accept(trimmed)
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setProblem(null)
      setShowManual(false)
      setManualValue('')
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{t('scanHint')}</DialogDescription>
        </DialogHeader>

        {!showManual ? (
          <div className="space-y-3">
            <div
              ref={scannerRef}
              className="relative aspect-square w-full overflow-hidden rounded-lg bg-black"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowManual(true)}
            >
              <Keyboard className="mr-2 h-4 w-4" />
              {t('enterManually')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {problem && (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
              >
                <CameraOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{t(`camera.${problem}.title`)}</p>
                  <p className="text-xs text-muted-foreground">
                    {problem === 'insecure'
                      ? t('camera.insecure.body', { host: window.location.hostname })
                      : t(`camera.${problem}.body`)}
                  </p>
                  {problem !== 'insecure' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1 h-7 bg-background px-2.5 text-xs"
                      onClick={retryCamera}
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t('camera.tryAgain')}
                    </Button>
                  )}
                </div>
              </div>
            )}
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <Input
                placeholder={t('enterBarcode')}
                aria-label={t('enterBarcode')}
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                autoFocus
              />
              <Button type="submit" disabled={!manualValue.trim()}>
                {t('submitBarcode')}
              </Button>
            </form>
            {!problem && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowManual(false)}
              >
                <Camera className="mr-2 h-4 w-4" />
                {t('useCamera')}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
