import { useEffect, useRef, useCallback } from 'react'

interface UseHardwareScannerOptions {
  onScan: (barcode: string) => void
  enabled?: boolean
}

export function useHardwareScanner({ onScan, enabled = true }: UseHardwareScannerOptions) {
  const bufferRef = useRef('')
  const lastKeystrokeRef = useRef(0)
  const timestampsRef = useRef<number[]>([])
  const cooldownRef = useRef(false)

  const reset = useCallback(() => {
    bufferRef.current = ''
    timestampsRef.current = []
  }, [])

  useEffect(() => {
    if (!enabled) {
      reset()
      return
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handleKeyDown = (e: KeyboardEvent) => {
      if (cooldownRef.current) return

      // Ignore when user is typing in input/textarea
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
        // Allow if it looks like a scanner (very rapid input)
        const now = Date.now()
        const gap = now - lastKeystrokeRef.current
        if (gap > 100 && bufferRef.current.length === 0) return
      }

      const now = Date.now()

      if (e.key === 'Enter') {
        e.preventDefault()
        const buffer = bufferRef.current
        const timestamps = timestampsRef.current

        if (buffer.length >= 4 && timestamps.length >= 2) {
          // Check average inter-keystroke time
          let totalGap = 0
          for (let i = 1; i < timestamps.length; i++) {
            totalGap += timestamps[i] - timestamps[i - 1]
          }
          const avgGap = totalGap / (timestamps.length - 1)

          if (avgGap < 80) {
            cooldownRef.current = true
            onScan(buffer)
            setTimeout(() => { cooldownRef.current = false }, 500)
          }
        }
        reset()
        return
      }

      // Only accumulate printable single characters
      if (e.key.length === 1) {
        // Reset if gap too large (new sequence)
        if (now - lastKeystrokeRef.current > 300 && bufferRef.current.length > 0) {
          reset()
        }

        bufferRef.current += e.key
        timestampsRef.current.push(now)
        lastKeystrokeRef.current = now

        // Auto-clear after 300ms of no input
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(reset, 300)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [enabled, onScan, reset])
}
