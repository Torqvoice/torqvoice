'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { FileText, Loader2, Sparkles } from 'lucide-react'
import { RichTextEditor } from './RichTextEditor'
import type { InitialData } from './form-types'
import { aiGenerateServiceNotes } from '@/features/ai/Actions/aiActions'

interface NotesSectionProps {
  initialData: InitialData
  onNotesChange: (field: 'invoiceNotes' | 'diagnosticNotes' | 'description', value: string) => void
  serviceRecordId?: string
  aiEnabled?: boolean
}

export function NotesSection({ initialData, onNotesChange, serviceRecordId, aiEnabled }: NotesSectionProps) {
  const t = useTranslations('service.notes')
  const [noteType, setNoteType] = useState<'public' | 'internal'>('public')
  const [publicNotes, setPublicNotes] = useState(initialData.invoiceNotes || '')
  const [internalNotes, setInternalNotes] = useState(initialData.diagnosticNotes || '')
  const [generating, setGenerating] = useState(false)

  const handlePublicChange = (html: string) => {
    setPublicNotes(html)
    onNotesChange('invoiceNotes', html)
  }

  const handleInternalChange = (html: string) => {
    setInternalNotes(html)
    onNotesChange('diagnosticNotes', html)
  }

  const handleAiGenerate = async () => {
    if (!serviceRecordId) return
    setGenerating(true)
    try {
      const result = await aiGenerateServiceNotes(serviceRecordId)
      if (result.success && result.data) {
        const html = result.data.replace(/\n/g, '<br>')
        if (noteType === 'public') {
          setPublicNotes(html)
          onNotesChange('invoiceNotes', html)
        } else {
          setInternalNotes(html)
          onNotesChange('diagnosticNotes', html)
        }
        toast.success(t('aiGenerated'))
      } else {
        toast.error(result.error ?? t('aiGenerateFailed'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('aiGenerateFailed'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-3.5 w-3.5" />
          {t('title')}
        </h3>
        <div className="flex items-center gap-2">
          {aiEnabled && serviceRecordId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleAiGenerate}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {t('aiWrite')}
            </Button>
          )}
          <Select value={noteType} onValueChange={(v) => setNoteType(v as 'public' | 'internal')}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">{t('public')}</SelectItem>
              <SelectItem value="internal">{t('internal')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {noteType === 'public' && (
        <div className="space-y-1">
          <RichTextEditor
            content={publicNotes}
            onChange={handlePublicChange}
            placeholder={t('publicPlaceholder')}
          />
          <p className="text-xs text-muted-foreground">{t('publicHelper')}</p>
        </div>
      )}

      {noteType === 'internal' && (
        <div className="space-y-1">
          <RichTextEditor
            content={internalNotes}
            onChange={handleInternalChange}
            placeholder={t('internalPlaceholder')}
          />
          <p className="text-xs text-muted-foreground">{t('internalHelper')}</p>
        </div>
      )}
    </div>
  )
}
