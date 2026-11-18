'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Copies one value, and says so for a moment. Plates, VINs, engine codes and
 * order numbers get typed into parts catalogues, registries and accounting
 * systems; one click instead of selecting text saves the trip.
 */
export function useCopy(value: string) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () => {
    const done = () => setCopied(true)
    // The clipboard API exists only on https and localhost. A self-hosted
    // install reached by its LAN address over http has no such thing, so it
    // falls back to the older way rather than doing nothing.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(value)
        .then(done)
        .catch(() => {
          if (legacyCopy(value)) done()
        })
    } else if (legacyCopy(value)) {
      done()
    }
  }
  return { copied, copy }
}

/** Copies through a hidden text field, for pages without the clipboard API. */
function legacyCopy(text: string) {
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  field.remove()
  return ok
}

/** A small copy button to sit beside a value. `label` names the value for screen readers. */
export function CopyValue({
  value,
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  const t = useTranslations('service.modern.vehicleInfo')
  const { copied, copy } = useCopy(value)
  const name = copied ? t('copied') : t('copy', { label })
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={name}
      title={name}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  )
}

/**
 * Text that copies itself when clicked, such as an order number in a list
 * row. It sits above a row's own link, so the click copies rather than opens.
 */
export function CopyText({
  value,
  label,
  className,
  children,
}: {
  value: string
  label: string
  className?: string
  children?: ReactNode
}) {
  const t = useTranslations('service.modern.vehicleInfo')
  const { copied, copy } = useCopy(value)
  const name = copied ? t('copied') : t('copy', { label })
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        copy()
      }}
      aria-label={name}
      title={name}
      className={cn(
        'relative z-10 inline-flex cursor-copy items-center gap-1 rounded px-0.5 -mx-0.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {children ?? value}
      {copied && <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />}
    </button>
  )
}
