'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Eraser, ImageUp, Loader2, PenLine, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { removeMySignature, saveMySignature } from '../Actions/signatureActions'

/** The widest a saved signature is kept, in pixels: sharp on paper, a few KB on disk. */
const MAX_WIDTH = 600
/** Room left around the ink when the image is cropped to it. */
const PADDING = 6
/** Anything lighter than this on an uploaded photo is paper, not ink. */
const PAPER_LUMINANCE = 215

type Mode = 'draw' | 'upload'

/**
 * The member's own signature for this workshop: drawn with a finger, a pen or
 * a mouse, or taken from a photo or scan. Either way it is saved as a PNG
 * cropped to the ink with a transparent background, so it sits on the
 * signature line of any design whatever its colours.
 */
export function SignatureCard({ initial }: { initial: string | null }) {
  const t = useTranslations('settings.account')
  const [saved, setSaved] = useState<string | null>(initial)
  const [editing, setEditing] = useState(initial === null)
  const [mode, setMode] = useState<Mode>('draw')
  const [hasInk, setHasInk] = useState(false)
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const drawing = useRef<{ x: number; y: number } | null>(null)

  /** Size the backing store to the element, so strokes are crisp on any screen. */
  const resetCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.2
    ctx.strokeStyle = '#111827'
    setHasInk(false)
  }, [])

  useEffect(() => {
    if (editing) resetCanvas()
  }, [editing, mode, resetCanvas])

  const pointOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'draw') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointOf(event)
    drawing.current = point
    const ctx = event.currentTarget.getContext('2d')
    if (!ctx) return
    // A tap leaves a dot, the way a pen would.
    ctx.beginPath()
    ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fillStyle = ctx.strokeStyle
    ctx.fill()
    setHasInk(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const last = drawing.current
    if (!last) return
    const ctx = event.currentTarget.getContext('2d')
    if (!ctx) return
    const point = pointOf(event)
    // Through the midpoint, so fast strokes curve instead of turning corners.
    const mid = { x: (last.x + point.x) / 2, y: (last.y + point.y) / 2 }
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    drawing.current = point
  }

  const onPointerUp = () => {
    drawing.current = null
  }

  /** Draw a picked image onto the canvas with the paper taken out. */
  const onFile = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('signatureNotImage'))
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      resetCanvas()
      const ratio = window.devicePixelRatio || 1
      const boxW = canvas.width / ratio
      const boxH = canvas.height / ratio
      const scale = Math.min(boxW / image.width, boxH / image.height, 1)
      const w = image.width * scale
      const h = image.height * scale
      ctx.drawImage(image, (boxW - w) / 2, (boxH - h) / 2, w, h)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = pixels.data
      let ink = false
      for (let i = 0; i < data.length; i += 4) {
        const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        if (luminance >= PAPER_LUMINANCE) {
          data[i + 3] = 0
        } else {
          // Fade the edges of the ink into the paper rather than cutting them.
          const alpha = Math.min(1, (PAPER_LUMINANCE - luminance) / 60)
          data[i + 3] = Math.round(data[i + 3] * alpha)
          if (data[i + 3] > 0) ink = true
        }
      }
      ctx.putImageData(pixels, 0, 0)
      setHasInk(ink)
      if (!ink) toast.error(t('signatureNoInk'))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error(t('signatureNotImage'))
    }
    image.src = url
  }

  /** The canvas cropped to its ink and scaled to size, as a PNG data URI. */
  const exportInk = (): string | null => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return null
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return null
    const cropW = maxX - minX + 1
    const cropH = maxY - minY + 1
    const scale = Math.min(1, (MAX_WIDTH - PADDING * 2) / cropW)
    const out = document.createElement('canvas')
    out.width = Math.round(cropW * scale) + PADDING * 2
    out.height = Math.round(cropH * scale) + PADDING * 2
    const outCtx = out.getContext('2d')
    if (!outCtx) return null
    outCtx.imageSmoothingQuality = 'high'
    outCtx.drawImage(
      canvas,
      minX,
      minY,
      cropW,
      cropH,
      PADDING,
      PADDING,
      out.width - PADDING * 2,
      out.height - PADDING * 2
    )
    return out.toDataURL('image/png')
  }

  const onSave = async () => {
    const dataUri = exportInk()
    if (!dataUri) {
      toast.error(t('signatureEmpty'))
      return
    }
    setBusy(true)
    const result = await saveMySignature(dataUri)
    setBusy(false)
    if (!result.success) {
      toast.error(result.error || t('signatureSaveFailed'))
      return
    }
    setSaved(dataUri)
    setEditing(false)
    toast.success(t('signatureSaved'))
  }

  const onRemove = async () => {
    setBusy(true)
    const result = await removeMySignature()
    setBusy(false)
    if (!result.success) {
      toast.error(result.error || t('signatureSaveFailed'))
      return
    }
    setSaved(null)
    setEditing(true)
    toast.success(t('signatureRemoved'))
  }

  return (
    <AppCard
      icon={PenLine}
      title={t('signatureTitle')}
      description={t('signatureDescription')}
      contentClassName="space-y-4"
    >
      {!editing && saved ? (
        <>
          <div className="flex h-36 items-center justify-center rounded-md border bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={saved} alt={t('signatureTitle')} className="max-h-full max-w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(true)} disabled={busy}>
              <PenLine className="mr-2 h-4 w-4" />
              {t('signatureReplace')}
            </Button>
            <Button variant="outline" onClick={onRemove} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t('signatureRemove')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <TabsList>
              <TabsTrigger value="draw">
                <PenLine className="mr-1.5 h-4 w-4" />
                {t('signatureDraw')}
              </TabsTrigger>
              <TabsTrigger value="upload">
                <ImageUp className="mr-1.5 h-4 w-4" />
                {t('signatureUpload')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <canvas
              ref={canvasRef}
              className={`h-40 w-full touch-none rounded-md border bg-white ${
                mode === 'draw' ? 'cursor-crosshair' : ''
              }`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              aria-label={t('signatureCanvasLabel')}
            />
            {/* The line a signature is written on, as on paper. */}
            <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-dashed border-gray-300" />
            {!hasInk && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                {mode === 'draw' ? t('signatureDrawHint') : t('signatureUploadHint')}
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              onFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <p className="text-xs text-muted-foreground">
            {mode === 'draw' ? t('signatureDrawTip') : t('signatureUploadTip')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSave} disabled={busy || !hasInk}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('signatureSave')}
            </Button>
            {mode === 'upload' && (
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                <ImageUp className="mr-2 h-4 w-4" />
                {t('signatureChooseFile')}
              </Button>
            )}
            <Button variant="outline" onClick={resetCanvas} disabled={busy || !hasInk}>
              <Eraser className="mr-2 h-4 w-4" />
              {t('signatureClear')}
            </Button>
            {saved && (
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                {t('signatureCancel')}
              </Button>
            )}
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {t.rich('signatureDesignerHint', {
          link: (chunks) => (
            <Link href="/invoice-designer" className="underline underline-offset-2">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </AppCard>
  )
}
