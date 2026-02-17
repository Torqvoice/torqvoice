'use client'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { InitialData } from './form-types'

interface NotesSectionProps {
  initialData: InitialData
}

export function NotesSection({ initialData }: NotesSectionProps) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <h3 className="text-sm font-semibold">Notes</h3>

      <div className="space-y-1">
        <Label className="text-xs">Diagnostic Notes</Label>
        <Textarea
          name="diagnosticNotes"
          placeholder="Diagnostic findings, observations, recommendations..."
          rows={3}
          defaultValue={initialData.diagnosticNotes}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Invoice Notes</Label>
        <Textarea
          name="invoiceNotes"
          placeholder="Notes for the customer..."
          rows={2}
          defaultValue={initialData.invoiceNotes}
        />
        <p className="text-xs text-muted-foreground">Shown on the invoice</p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Internal Notes</Label>
        <Textarea
          name="description"
          placeholder="Internal notes (not shown on invoice)..."
          rows={2}
          defaultValue={initialData.description}
        />
      </div>
    </div>
  )
}
