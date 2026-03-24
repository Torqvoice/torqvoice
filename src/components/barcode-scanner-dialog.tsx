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
import { Camera, Keyboard } from 'lucide-react'

interface BarcodeScannerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (barcode: string) => void
  title?: string
}

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  title = 'Scan Barcode',
}: BarcodeScannerDialogProps) {
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrRef = useRef<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const hasScannedRef = useRef(false)

  const handleScan = useCallback(
    (decodedText: string) => {
      if (hasScannedRef.current) return
      hasScannedRef.current = true
      onScan(decodedText)
      onOpenChange(false)
    },
    [onScan, onOpenChange]
  )

  useEffect(() => {
    if (!open || showManual) {
      hasScannedRef.current = false
      return
    }

    let scanner: any = null
    let mounted = true
    let running = false

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')

        if (!mounted || !scannerRef.current) return

        const containerId = 'barcode-scanner-region'
        if (!document.getElementById(containerId)) {
          const div = document.createElement('div')
          div.id = containerId
          scannerRef.current.appendChild(div)
        }

        scanner = new Html5Qrcode(containerId)
        html5QrRef.current = scanner

        const scanConfig = {
          fps: 10,
          qrbox: { width: 250, height: 150 },
        }
        const onSuccess = (decodedText: string) => {
          if (mounted) handleScan(decodedText)
        }
        const onError = () => {}

        try {
          // Try rear camera first (mobile)
          await scanner.start({ facingMode: 'environment' }, scanConfig, onSuccess, onError)
        } catch {
          // Fall back to any available camera (desktop USB/webcam)
          const devices = await Html5Qrcode.getCameras()
          if (!devices.length) throw new Error('NotFoundError')
          await scanner.start(devices[0].id, scanConfig, onSuccess, onError)
        }
        running = true
      } catch (err: any) {
        if (!mounted) return
        console.error('[BarcodeScan] Camera error:', err?.name, err?.message, err)

        const isInsecure = window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'

        if (isInsecure) {
          setError(`Camera requires HTTPS. You are on HTTP (${window.location.hostname}). Use localhost or enable HTTPS for camera access. You can enter the barcode manually below.`)
        } else if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
          setError('Camera access denied. Please allow camera permissions or enter the barcode manually.')
        } else if (err?.name === 'NotFoundError' || err?.message === 'NotFoundError') {
          setError('No camera found on this device. Please enter the barcode manually.')
        } else {
          setError(`Could not start camera: ${err?.message || 'Unknown error'}. Please enter the barcode manually.`)
        }
        setShowManual(true)
      }
    }

    const timer = setTimeout(startScanner, 100)

    return () => {
      mounted = false
      clearTimeout(timer)
      if (scanner && running) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {})
      }
      html5QrRef.current = null
    }
  }, [open, showManual, handleScan])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualValue.trim()
    if (trimmed) {
      handleScan(trimmed)
    }
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setError(null)
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
          <DialogDescription className="sr-only">
            Point your camera at a barcode or enter it manually
          </DialogDescription>
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
              Enter manually
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {error && (
              <p className="text-sm text-muted-foreground">{error}</p>
            )}
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <Input
                placeholder="Enter barcode..."
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                autoFocus
              />
              <Button type="submit" disabled={!manualValue.trim()}>
                Go
              </Button>
            </form>
            {!error && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowManual(false)}
              >
                <Camera className="mr-2 h-4 w-4" />
                Use camera
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
