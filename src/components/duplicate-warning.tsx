'use client'

import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'

/**
 * A warning under a field that another record of the workshop already has
 * what was typed: what it is, then each record by name with a link. The
 * link opens in a new tab so the form, and what was typed into it, stays.
 * Nothing is refused; the form saves anyway.
 */
export function DuplicateWarning({
  id,
  message,
  records,
}: {
  /** For the field's aria-describedby. */
  id: string
  message: string
  records: { id: string; href: string; label: string }[]
}) {
  if (records.length === 0) return null
  return (
    <div
      id={id}
      role="status"
      className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400"
      data-duplicate-warning
    >
      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="min-w-0">
        {message}{' '}
        {records.map((record, index) => (
          <span key={record.id}>
            {index > 0 && ', '}
            <Link
              href={record.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:text-foreground"
            >
              {record.label}
            </Link>
          </span>
        ))}
      </p>
    </div>
  )
}

/** A non-blocking note under a field: said, not refused. */
export function FieldNotice({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      role="status"
      className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400"
      data-field-notice
    >
      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  )
}
