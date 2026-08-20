'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Check, Loader2, Minus, Plus, Printer } from 'lucide-react'
import { DocsLink } from '@/components/docs-link'
import { LABEL_FORMATS, LABEL_SPECS, defaultCopies, type LabelFormat } from '../Lib/labels'
import { getLabelPreview, type LabelPreview as LabelPreviewData } from '../Actions/getLabelPreview'
import { LabelPreview } from './LabelPreview'

const STORAGE_KEY = 'tireHotel.labelFormat'

/**
 * Printing stickers for a set.
 *
 * Two panels: the choices on the left, and what they produce on the right.
 * The formats differ mostly in how much survives on them, which is not
 * something a name and a measurement can convey, so the preview updates as
 * the format changes and shows the real plate and size rather than a mockup.
 *
 * A shop buys one kind of label roll and then uses it for years, so the
 * format is remembered per browser and the dialog opens ready to print.
 */
export function PrintLabelsDialog({
  open,
  onOpenChange,
  tireSetId,
  quantity,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tireSetId: string
  quantity: number
}) {
  const t = useTranslations('tireHotel')
  const [format, setFormat] = useState<LabelFormat>('dymo_standard')
  const [copies, setCopies] = useState(defaultCopies(quantity))
  const [preview, setPreview] = useState<LabelPreviewData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setPreview(null)
      return
    }
    setCopies(defaultCopies(quantity))
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved && (LABEL_FORMATS as readonly string[]).includes(saved)) {
        setFormat(saved as LabelFormat)
      }
    } catch {
      // Private browsing or a locked-down profile. The default is fine.
    }

    let cancelled = false
    setLoading(true)
    getLabelPreview(tireSetId).then((result) => {
      if (cancelled) return
      setPreview(result.success && result.data ? result.data : null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, tireSetId, quantity])

  const choose = (value: LabelFormat) => {
    setFormat(value)
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Not remembering the choice is not worth failing the print over.
    }
  }

  const labelUrl =
    typeof window === 'undefined' ? '' : `${window.location.origin}/tire-hotel/${tireSetId}`

  const handlePrint = () => {
    const url = `/api/protected/tire-hotel/${tireSetId}/labels?format=${format}&copies=${copies}`
    window.open(url, '_blank', 'noopener,noreferrer')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('label.title')}</DialogTitle>
          <DialogDescription>{t('label.description')}</DialogDescription>
          <DocsLink href="/docs/features/tire-hotel" variant="hint" className="self-start" />
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Choices */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('label.format')}</Label>
              <div className="grid gap-2">
                {LABEL_FORMATS.map((value) => {
                  const spec = LABEL_SPECS[value]
                  const isOn = format === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => choose(value)}
                      aria-pressed={isOn}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                        isOn ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/60'
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {t(`label.formats.${value}`)}
                        </span>
                        <span className="block text-xs tabular-nums text-muted-foreground">
                          {spec.widthMm} x {spec.heightMm} mm
                          {spec.columns * spec.rows > 1
                            ? ` · ${t('label.perSheet', { count: spec.columns * spec.rows })}`
                            : ''}
                        </span>
                      </span>
                      {isOn && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="labelCopies">{t('label.copies')}</Label>
              {/* Stepper rather than a bare number field: this gets used with
                  gloves on, and the count is almost always nudged by one. */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => setCopies((c) => Math.max(1, c - 1))}
                  disabled={copies <= 1}
                  aria-label={t('label.fewer')}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="labelCopies"
                  type="number"
                  min="1"
                  max="40"
                  value={copies}
                  onChange={(e) =>
                    setCopies(Math.max(1, Math.min(40, Number(e.target.value) || 1)))
                  }
                  className="h-10 w-20 text-center text-base tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => setCopies((c) => Math.min(40, c + 1))}
                  disabled={copies >= 40}
                  aria-label={t('label.more')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('label.copiesHint', { count: quantity })}
              </p>
            </div>
          </div>

          {/* What that produces */}
          <div className="space-y-2">
            <Label>{t('label.preview')}</Label>
            <div className="flex min-h-[280px] items-center justify-center rounded-lg border bg-muted/30 p-4">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : preview ? (
                <LabelPreview data={preview} format={format} url={labelUrl} />
              ) : (
                <p className="text-xs text-muted-foreground">{t('label.previewFailed')}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t('label.previewScale')}</p>
            <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              {t('label.shelfNote')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handlePrint} disabled={loading}>
            <Printer className="mr-2 h-4 w-4" />
            {t('label.print')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
