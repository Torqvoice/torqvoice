'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Loader2, RotateCcw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** The camera picked last time, so a desk with a webcam plugged in keeps using it. */
const CAMERA_KEY = 'torqvoice.photo-camera'
/** Ask for a sharp picture; a camera that cannot do this gives its best. */
const SIZE = { width: { ideal: 1920 }, height: { ideal: 1080 } }
const JPEG_QUALITY = 0.92

type Phase = 'starting' | 'ready' | 'review' | 'failed'
/** Why there is no picture: each has its own sentence and way forward. */
type Problem = 'denied' | 'insecure' | 'notFound' | 'failed'

function errorName(err: unknown): string {
  return err && typeof err === 'object' && 'name' in err ? String(err.name) : ''
}

function problemOf(err: unknown): Problem {
  const name = errorName(err)
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'notFound'
  return 'failed'
}

function rememberedCamera(): string | null {
  try {
    return window.localStorage.getItem(CAMERA_KEY)
  } catch {
    return null
  }
}

function rememberCamera(id: string | null) {
  try {
    if (id) window.localStorage.setItem(CAMERA_KEY, id)
    else window.localStorage.removeItem(CAMERA_KEY)
  } catch {
    // Private windows may refuse storage; the default camera is used next time.
  }
}

/** Opens the chosen camera, or the default one when the chosen one is unplugged. */
async function openCamera(cameraId: string | null): Promise<MediaStream> {
  if (cameraId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cameraId }, ...SIZE },
      })
    } catch (err) {
      const name = errorName(err)
      if (name !== 'OverconstrainedError' && name !== 'NotFoundError') throw err
      rememberCamera(null)
    }
  }
  return navigator.mediaDevices.getUserMedia({ video: SIZE })
}

/**
 * Takes a photo with the computer's own camera or a webcam plugged into it,
 * for the desk: a phone opens its camera app from a file input with
 * `capture`, a desk browser ignores `capture` and shows the file picker, so
 * the page takes the picture itself. The photo is looked at before it is
 * used, and handed over as a JPEG file, exactly as if it had been uploaded.
 *
 * The preview is not mirrored, so a part number held up to the camera reads
 * the right way round, on screen and in the photo.
 */
export function CameraPhotoDialog({
  open,
  onOpenChange,
  onCaptured,
  onUploadInstead,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCaptured: (file: File) => void
  /** Offered when the camera cannot be used, so the photo can still be added. */
  onUploadInstead?: () => void
}) {
  const t = useTranslations('common.photoCapture')
  const liveRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<Phase>('starting')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  // The camera picked in this dialog (otherwise the one used last time), and
  // the one that actually answered.
  const [cameraId, setCameraId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null)

  const stopStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
  }, [])

  const dropShot = useCallback(() => {
    setShot((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
  }, [])

  // The camera runs while the dialog is open and waiting for a photo; it is
  // switched off while the photo is looked at, and whenever the dialog closes.
  const reviewing = phase === 'review'
  useEffect(() => {
    if (!open || reviewing) return
    // Browsers only hand out the camera on HTTPS or localhost; asking would
    // only fail, so say why straight away.
    if (!window.isSecureContext) {
      setProblem('insecure')
      setPhase('failed')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setProblem('failed')
      setPhase('failed')
      return
    }
    let cancelled = false
    async function start() {
      setPhase('starting')
      try {
        const stream = await openCamera(cameraId ?? rememberedCamera())
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        setActiveId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? null)
        if (liveRef.current) liveRef.current.srcObject = stream
        // Names are only given out once the camera is allowed, so list them now.
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        setCameras(devices.filter((d) => d.kind === 'videoinput' && d.deviceId))
        setProblem(null)
      } catch (err) {
        if (cancelled) return
        setProblem(problemOf(err))
        setPhase('failed')
      }
    }
    void start()
    return () => {
      cancelled = true
      stopStream()
    }
  }, [open, cameraId, reviewing, attempt, stopStream])

  // A dialog closed before the photo was used keeps nothing.
  useEffect(() => {
    if (open) return
    dropShot()
    setProblem(null)
    setPhase('starting')
  }, [open, dropShot])

  function chooseCamera(id: string) {
    rememberCamera(id)
    setCameraId(id)
  }

  function takePhoto() {
    const video = liveRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
        setShot({ file, url: URL.createObjectURL(blob) })
        setPhase('review')
      },
      'image/jpeg',
      JPEG_QUALITY
    )
  }

  function takeAgain() {
    dropShot()
    setPhase('starting')
  }

  function tryAgain() {
    setProblem(null)
    setPhase('starting')
    setAttempt((n) => n + 1)
  }

  function usePhoto() {
    if (!shot) return
    onCaptured(shot.file)
    onOpenChange(false)
  }

  function uploadInstead() {
    onOpenChange(false)
    onUploadInstead?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="camera-photo">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {phase === 'failed' ? (
          <div
            role="alert"
            className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3"
          >
            <p className="text-sm font-medium">{t(`${problem ?? 'failed'}.title`)}</p>
            <p className="text-sm text-muted-foreground">
              {problem === 'insecure'
                ? t('insecure.body', { host: window.location.hostname })
                : t(`${problem ?? 'failed'}.body`)}
            </p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-lg bg-black">
            {phase === 'review' && shot ? (
              <img
                src={shot.url}
                alt={t('preview')}
                className="aspect-video w-full object-contain"
              />
            ) : (
              <video
                ref={liveRef}
                autoPlay
                muted
                playsInline
                aria-label={t('live')}
                className="aspect-video w-full object-contain"
                onLoadedMetadata={() => setPhase((p) => (p === 'starting' ? 'ready' : p))}
              />
            )}
            {phase === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('starting')}
              </div>
            )}
          </div>
        )}

        {cameras.length > 1 && (phase === 'ready' || phase === 'starting') && (
          <Select value={activeId ?? cameras[0]?.deviceId} onValueChange={chooseCamera}>
            <SelectTrigger aria-label={t('camera')} className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cameras.map((camera, index) => (
                <SelectItem key={camera.deviceId} value={camera.deviceId}>
                  {camera.label || `${t('camera')} ${index + 1}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          {phase === 'review' ? (
            <>
              <Button type="button" variant="outline" onClick={takeAgain}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                {t('retake')}
              </Button>
              <Button type="button" onClick={usePhoto}>
                {t('use')}
              </Button>
            </>
          ) : phase === 'failed' ? (
            <>
              {onUploadInstead && (
                <Button type="button" variant="outline" onClick={uploadInstead}>
                  <Upload className="mr-1.5 h-4 w-4" />
                  {t('uploadInstead')}
                </Button>
              )}
              {problem !== 'insecure' && (
                <Button type="button" onClick={tryAgain}>
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  {t('tryAgain')}
                </Button>
              )}
            </>
          ) : (
            <Button type="button" onClick={takePhoto} disabled={phase !== 'ready'}>
              <Camera className="mr-1.5 h-4 w-4" />
              {t('take')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
