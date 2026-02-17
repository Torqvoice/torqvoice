'use client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileText } from 'lucide-react'
import { RichTextEditor } from './RichTextEditor'
import type { InitialData } from './form-types'

interface NotesSectionProps {
  initialData: InitialData
  onNotesChange: (field: 'invoiceNotes' | 'diagnosticNotes' | 'description', value: string) => void
}

export function NotesSection({ initialData, onNotesChange }: NotesSectionProps) {
  const [noteType, setNoteType] = useState<'public' | 'internal'>('public')
  const [publicNotes, setPublicNotes] = useState(initialData.invoiceNotes || '')
  const [internalNotes, setInternalNotes] = useState(initialData.diagnosticNotes || '')

  const handlePublicChange = (html: string) => {
    setPublicNotes(html)
    onNotesChange('invoiceNotes', html)
  }

  const handleInternalChange = (html: string) => {
    setInternalNotes(html)
    onNotesChange('diagnosticNotes', html)
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-3.5 w-3.5" />
          Notes
        </h3>
        <Select value={noteType} onValueChange={(v) => setNoteType(v as 'public' | 'internal')}>
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {noteType === 'public' && (
        <div className="space-y-1">
          <RichTextEditor
            content={publicNotes}
            onChange={handlePublicChange}
            placeholder="Notes visible on the invoice..."
          />
          <p className="text-xs text-muted-foreground">Shown on the invoice and shared documents</p>
        </div>
      )}

      {noteType === 'internal' && (
        <div className="space-y-1">
          <RichTextEditor
            content={internalNotes}
            onChange={handleInternalChange}
            placeholder="Internal notes (not shown on invoice)..."
          />
          <p className="text-xs text-muted-foreground">Only visible to your team</p>
        </div>
      )}
    </div>
  )
}
