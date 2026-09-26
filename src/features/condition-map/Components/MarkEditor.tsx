'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Loader2, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { MARK_KINDS, type MarkKind, type MarkSeverity, SEVERITIES } from '../Lib/marks'
import { MarkIcon } from './ConditionMap'

export interface EditableMark {
  id: string
  number: number
  panel: string
  kind: string
  severity: string
  note: string | null
  imageUrls: string[]
}

/**
 * One mark's details: what it is, how bad, a note, photos. The kind and the
 * severity save as they are tapped; the note saves when the field is left,
 * so a technician can tap through a walk-round without a Save button.
 */
export function MarkEditor({
  mark,
  open,
  readOnly = false,
  busy = false,
  onChange,
  onRemove,
  onAddPhotos,
  onRemovePhoto,
  onClose,
}: {
  mark: EditableMark | null
  open: boolean
  readOnly?: boolean
  busy?: boolean
  onChange: (patch: { kind?: MarkKind; severity?: MarkSeverity; note?: string | null }) => void
  onRemove: () => void
  onAddPhotos: (files: File[]) => Promise<void>
  onRemovePhoto: (url: string) => void
  onClose: () => void
}) {
  const t = useTranslations('conditionMap')
  const [note, setNote] = useState(mark?.note ?? '')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  // A different mark, a different note.
  useEffect(() => {
    setNote(mark?.note ?? '')
  }, [mark?.id, mark?.note])

  const commitNote = () => {
    if (readOnly || !mark) return
    if ((mark.note ?? '') !== note) onChange({ note: note || null })
  }

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0 || readOnly) return
    setUploading(true)
    try {
      await onAddPhotos(Array.from(files))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
      if (cameraRef.current) cameraRef.current.value = ''
    }
  }

  const area = mark ? t(`panels.${mark.panel}`) : ''

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          commitNote()
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mark && (
              <MarkIcon
                kind={mark.kind as MarkKind}
                severity={mark.severity as MarkSeverity}
                number={mark.number}
                size={22}
              />
            )}
            {mark ? t('markOn', { kind: t(`kinds.${mark.kind}`), area }) : t('edit')}
          </DialogTitle>
          <DialogDescription>{readOnly ? t('readOnly') : t('description')}</DialogDescription>
        </DialogHeader>

        {mark && (
          <div className="space-y-4">
            <fieldset disabled={readOnly || busy}>
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
                {t('kind')}
              </legend>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {MARK_KINDS.map((kind) => {
                  const active = mark.kind === kind
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange({ kind })}
                      className={cn(
                        'flex h-11 items-center gap-2 rounded-md border px-2 text-left text-xs font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-input bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <MarkIcon kind={kind} severity={mark.severity as MarkSeverity} size={18} />
                      <span className="truncate">{t(`kinds.${kind}`)}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <fieldset disabled={readOnly || busy}>
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
                {t('severity')}
              </legend>
              <div className="flex gap-1.5">
                {SEVERITIES.map((severity) => {
                  const active = mark.severity === severity
                  return (
                    <button
                      key={severity}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange({ severity })}
                      className={cn(
                        'h-10 flex-1 rounded-md border text-sm font-medium transition-colors',
                        active
                          ? severity === 'major'
                            ? 'border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-300'
                            : 'border-primary bg-primary/10 text-foreground'
                          : 'border-input bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {t(`severities.${severity}`)}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <label
                htmlFor={`mark-note-${mark.id}`}
                className="text-xs font-medium text-muted-foreground"
              >
                {t('note')}
              </label>
              <Textarea
                id={`mark-note-${mark.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={commitNote}
                disabled={readOnly}
                placeholder={t('notePlaceholder')}
                className="min-h-[68px] text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t('photo')}</p>
              <div className="flex flex-wrap items-center gap-2">
                {mark.imageUrls.map((url, index) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={t('photosOf', { n: mark.number })}
                      className="h-20 w-20 rounded-md border object-cover"
                    />
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                        onClick={() => onRemovePhoto(url)}
                        aria-label={`${t('removePhoto')} ${index + 1}`}
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-20 w-20 flex-col gap-1 text-xs"
                      disabled={uploading}
                      onClick={() => cameraRef.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Camera className="h-4 w-4" aria-hidden="true" />
                      )}
                      {t('takePhoto')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      {t('addPhoto')}
                    </Button>
                    <input
                      ref={cameraRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      tabIndex={-1}
                      onChange={(e) => void upload(e.target.files)}
                    />
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      tabIndex={-1}
                      onChange={(e) => void upload(e.target.files)}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {!readOnly && mark ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={onRemove}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('remove')}
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            onClick={() => {
              commitNote()
              onClose()
            }}
          >
            {t('done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
