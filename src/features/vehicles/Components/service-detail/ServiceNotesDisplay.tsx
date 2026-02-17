'use client'

import { FileText, Globe, Lock } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

interface ServiceNotesDisplayProps {
  invoiceNotes: string | null
  diagnosticNotes: string | null
  description: string | null
}

export function ServiceNotesDisplay({
  invoiceNotes,
  diagnosticNotes,
  description,
}: ServiceNotesDisplayProps) {
  const hasPublic = !!invoiceNotes
  const hasInternal = !!diagnosticNotes || !!description

  if (!hasPublic && !hasInternal) return null

  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <FileText className="h-3.5 w-3.5" />
        Notes
      </h3>
      <div className="space-y-3">
        {hasPublic && (
          <div>
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Globe className="h-3 w-3" />
              Public
            </span>
            <div
              className="notes-content text-sm"
              dangerouslySetInnerHTML={{ __html: invoiceNotes! }}
            />
          </div>
        )}
        {hasPublic && hasInternal && <Separator />}
        {hasInternal && (
          <div>
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Lock className="h-3 w-3" />
              Internal
            </span>
            {diagnosticNotes && (
              <div
                className="notes-content text-sm"
                dangerouslySetInnerHTML={{ __html: diagnosticNotes }}
              />
            )}
            {description && !diagnosticNotes && (
              <p className="whitespace-pre-wrap text-sm">{description}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
