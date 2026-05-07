'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { FileText, Loader2, Sparkles } from 'lucide-react'
import { RichTextEditor } from './RichTextEditor'
import type { InitialData } from './form-types'
import { aiGenerateServiceNotes } from '@/features/ai/Actions/aiActions'

const SKIP_AI_DIALOG_KEY = 'torqvoice:skipAiWriteDialog'

interface NotesSectionProps {
  initialData: InitialData
  onNotesChange: (field: 'invoiceNotes' | 'diagnosticNotes' | 'description', value: string) => void
  serviceRecordId?: string
  aiEnabled?: boolean
}

function hasContent(html: string): boolean {
  const text = html.replace(/<[^>]*>/g, '').trim()
  return text.length > 0
}

export function NotesSection({ initialData, onNotesChange, serviceRecordId, aiEnabled }: NotesSectionProps) {
  const t = useTranslations('service.notes')
  const [noteType, setNoteType] = useState<'public' | 'internal'>('public')
  const [publicNotes, setPublicNotes] = useState(initialData.invoiceNotes || '')
  const [internalNotes, setInternalNotes] = useState(initialData.diagnosticNotes || '')
  const [generating, setGenerating] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const handlePublicChange = (html: string) => {
    setPublicNotes(html)
    onNotesChange('invoiceNotes', html)
  }

  const handleInternalChange = (html: string) => {
    setInternalNotes(html)
    onNotesChange('diagnosticNotes', html)
  }

  const runAiGenerate = async (mode: 'replace' | 'append') => {
    if (!serviceRecordId) return
    setGenerating(true)
    try {
      const result = await aiGenerateServiceNotes(serviceRecordId)
      if (result.success && result.data) {
        const html = result.data.replace(/\n/g, '<br>')
        const currentNotes = noteType === 'public' ? publicNotes : internalNotes
        const finalHtml = mode === 'append' ? `${currentNotes}<br><br>${html}` : html

        if (noteType === 'public') {
          setPublicNotes(finalHtml)
          onNotesChange('invoiceNotes', finalHtml)
        } else {
          setInternalNotes(finalHtml)
          onNotesChange('diagnosticNotes', finalHtml)
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

  const handleAiClick = () => {
    const skipDialog = localStorage.getItem(SKIP_AI_DIALOG_KEY) === 'true'
    const currentNotes = noteType === 'public' ? publicNotes : internalNotes

    if (skipDialog && !hasContent(currentNotes)) {
      runAiGenerate('replace')
    } else {
      setDontShowAgain(false)
      setShowDialog(true)
    }
  }

  const handleGenerate = (mode: 'replace' | 'append') => {
    if (dontShowAgain) {
      localStorage.setItem(SKIP_AI_DIALOG_KEY, 'true')
    }
    setShowDialog(false)
    runAiGenerate(mode)
  }

  const notesHaveContent = hasContent(noteType === 'public' ? publicNotes : internalNotes)
  const publicHasContent = hasContent(publicNotes)
  const internalHasContent = hasContent(internalNotes)

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="h-3.5 w-3.5" />
        {t('title')}
      </h3>

      <Tabs value={noteType} onValueChange={(v) => setNoteType(v as 'public' | 'internal')}>
        <div className="flex items-center justify-between gap-2">
          <TabsList className="h-8">
            <TabsTrigger value="public" className="text-xs">
              {t('public')}
              {publicHasContent && (
                <span
                  aria-hidden
                  className="ml-1.5 h-1.5 w-1.5 rounded-full bg-sky-500"
                />
              )}
            </TabsTrigger>
            <TabsTrigger value="internal" className="text-xs">
              {t('internal')}
              {internalHasContent && (
                <span
                  aria-hidden
                  className="ml-1.5 h-1.5 w-1.5 rounded-full bg-orange-500"
                />
              )}
            </TabsTrigger>
          </TabsList>
          {aiEnabled && serviceRecordId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleAiClick}
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
        </div>

        <TabsContent value="public" className="space-y-1">
          <RichTextEditor
            content={publicNotes}
            onChange={handlePublicChange}
            placeholder={t('publicPlaceholder')}
          />
          <p className="text-xs text-muted-foreground">{t('publicHelper')}</p>
        </TabsContent>

        <TabsContent value="internal" className="space-y-1">
          <RichTextEditor
            content={internalNotes}
            onChange={handleInternalChange}
            placeholder={t('internalPlaceholder')}
          />
          <p className="text-xs text-muted-foreground">{t('internalHelper')}</p>
        </TabsContent>
      </Tabs>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t('aiDialogTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('aiDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          {notesHaveContent && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {t('aiOverwriteDescription')}
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dont-show-again"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="dont-show-again" className="text-sm text-muted-foreground">
              {t('aiDontShowAgain')}
            </label>
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t('aiOverwriteCancel')}
            </Button>
            {notesHaveContent && (
              <Button variant="outline" onClick={() => handleGenerate('append')}>
                {t('aiOverwriteAppend')}
              </Button>
            )}
            <Button onClick={() => handleGenerate('replace')}>
              {notesHaveContent ? t('aiOverwriteReplace') : t('aiGenerate')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
