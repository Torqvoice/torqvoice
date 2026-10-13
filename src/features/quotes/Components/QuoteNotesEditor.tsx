'use client'

import { memo } from 'react'
import { FileText } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RichTextEditor } from '@/features/vehicles/Components/service-edit/RichTextEditor'

interface QuoteNotesEditorProps {
  noteType: 'public' | 'internal'
  onNoteTypeChange: (v: 'public' | 'internal') => void
  description: string
  onDescriptionChange: (v: string) => void
  notes: string
  onNotesChange: (v: string) => void
  /**
   * A locked quote refuses edits. The fieldset around this turns off inputs
   * and buttons but not a contenteditable, so the editor has to be told, or
   * text typed into a locked quote looks accepted and is never saved.
   */
  locked?: boolean
  t: (key: string) => string
}

export const QuoteNotesEditor = memo(function QuoteNotesEditor({
  noteType,
  onNoteTypeChange,
  description,
  onDescriptionChange,
  notes,
  onNotesChange,
  locked = false,
  t,
}: QuoteNotesEditorProps) {
  return (
    // The panel is the field: its header, then the editor to the panel's
    // edges, then one line saying who reads the note. It used to be a frame
    // around a second, smaller bordered box.
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-3.5 w-3.5" />
          {t('notes.title')}
        </h3>
        <Select
          value={noteType}
          onValueChange={(v) => onNoteTypeChange(v as 'public' | 'internal')}
        >
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">{t('notes.public')}</SelectItem>
            <SelectItem value="internal">{t('notes.internal')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="border-t">
        {noteType === 'public' && (
          <RichTextEditor
            variant="flush"
            gutter="panel"
            editable={!locked}
            content={description}
            onChange={onDescriptionChange}
            placeholder={t('notes.publicPlaceholder')}
          />
        )}
        {noteType === 'internal' && (
          <RichTextEditor
            variant="flush"
            gutter="panel"
            editable={!locked}
            content={notes}
            onChange={onNotesChange}
            placeholder={t('notes.internalPlaceholder')}
          />
        )}
      </div>
      <p className="border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        {noteType === 'public' ? t('notes.publicHelper') : t('notes.internalHelper')}
      </p>
    </div>
  )
})
