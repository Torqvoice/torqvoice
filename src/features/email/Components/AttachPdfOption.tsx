'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getAttachPdfDefault } from '@/features/email/Actions/emailPreferenceActions'

/**
 * The workshop's default answer to "attach the PDF", fetched when the dialog
 * opens so no page has to thread the setting down to it. Attaching until the
 * answer arrives: it is the old behaviour and the common one.
 *
 * A tick made before the answer arrives wins over it, so a slow fetch never
 * puts back a PDF the user just took off.
 */
export function useAttachPdf(open: boolean) {
  const [attachPdf, setAttachPdfState] = useState(true)
  const chosen = useRef(false)

  useEffect(() => {
    if (!open) return
    chosen.current = false
    let cancelled = false
    // A background read nobody asked for: when it cannot reach the server the
    // box keeps its default rather than raising the lost-connection notice.
    getAttachPdfDefault()
      .catch(() => null)
      .then((result) => {
        if (!cancelled && !chosen.current && result?.success && result.data) {
          setAttachPdfState(result.data.attachPdf)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const setAttachPdf = useCallback((checked: boolean) => {
    chosen.current = true
    setAttachPdfState(checked)
  }, [])

  return [attachPdf, setAttachPdf] as const
}
