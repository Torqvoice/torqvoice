'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Circle, Loader2, RotateCcw, Square } from 'lucide-react'
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

/** A recording stops by itself here: ten minutes stays well under the upload limit. */
const MAX_MINUTES = 10
/** About 2.5 Mbit/s: a clear picture at a size that uploads from a workshop line. */
const VIDEO_BITS_PER_SECOND = 2_500_000

/** What the browser can record, best first. Chrome and Firefox write WebM, Safari MP4. */
const MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
]

type Phase = 'starting' | 'ready' | 'recording' | 'review' | 'failed'
type Failure = 'denied' | 'noCamera' | 'unsupported'

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Records a video with the computer's own camera and microphone, for the desk:
 * a phone opens its camera app from a file input, a desk computer has nothing
 * to open, so the page records itself. The take is watched back before it is
 * used, and handed over as a file, exactly as if it had been uploaded.
 */
export function VideoRecorderDialog({
  open,
  onOpenChange,
  onRecorded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecorded: (file: File) => void
}) {
  const t = useTranslations('common.videoRecorder')
  const liveRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [phase, setPhase] = useState<Phase>('starting')
  const [failure, setFailure] = useState<Failure | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [take, setTake] = useState<{ file: File; url: string } | null>(null)

  const stopStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
  }, [])

  const dropTake = useCallback(() => {
    setTake((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
  }, [])

  // The camera runs while the dialog is open and waiting to record; it is
  // switched off for the review and whenever the dialog closes.
  const reviewing = phase === 'review'
  useEffect(() => {
    if (!open || reviewing) return
    let cancelled = false
    async function start() {
      if (!pickMimeType() || !navigator.mediaDevices?.getUserMedia) {
        setFailure('unsupported')
        setPhase('failed')
        return
      }
      setPhase('starting')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cameraId ? { deviceId: { exact: cameraId } } : true,
          audio: true,
        })
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        if (liveRef.current) liveRef.current.srcObject = stream
        const devices = await navigator.mediaDevices.enumerateDevices()
        setCameras(devices.filter((d) => d.kind === 'videoinput' && d.deviceId))
        setFailure(null)
        setPhase('ready')
      } catch (err) {
        if (cancelled) return
        const name = err instanceof DOMException ? err.name : ''
        setFailure(
          name === 'NotFoundError' || name === 'OverconstrainedError' ? 'noCamera' : 'denied'
        )
        setPhase('failed')
      }
    }
    void start()
    return () => {
      cancelled = true
      stopStream()
    }
  }, [open, cameraId, reviewing, stopStream])

  // A dialog closed mid-recording keeps nothing.
  useEffect(() => {
    if (open) return
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    recorderRef.current = null
    setElapsed(0)
    dropTake()
    setPhase('starting')
  }, [open, dropTake])

  // The running clock, and the limit.
  useEffect(() => {
    if (phase !== 'recording') return
    const started = Date.now() - elapsed * 1000
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000)
      setElapsed(seconds)
      if (seconds >= MAX_MINUTES * 60) recorderRef.current?.stop()
    }, 250)
    return () => window.clearInterval(timer)
  }, [phase])

  function startRecording() {
    const stream = streamRef.current
    const mimeType = pickMimeType()
    if (!stream || !mimeType) return
    chunksRef.current = []
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    })
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      // The upload route takes the plain type, without the codec list.
      const type = mimeType.split(';')[0]
      const extension = type === 'video/mp4' ? 'mp4' : 'webm'
      const blob = new Blob(chunksRef.current, { type })
      const file = new File([blob], `recording-${Date.now()}.${extension}`, { type })
      setTake({ file, url: URL.createObjectURL(blob) })
      setPhase('review')
    }
    recorderRef.current = recorder
    setElapsed(0)
    recorder.start(1000)
    setPhase('recording')
  }

  function retake() {
    dropTake()
    setElapsed(0)
    setPhase('starting')
  }

  function acceptTake() {
    if (!take) return
    onRecorded(take.file)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="video-recorder">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('limit', { minutes: MAX_MINUTES })}</DialogDescription>
        </DialogHeader>

        {phase === 'failed' ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            {failure ? t(failure) : t('unsupported')}
          </p>
        ) : (
          <div className="relative overflow-hidden rounded-lg bg-black">
            {phase === 'review' && take ? (
              <video src={take.url} controls playsInline className="aspect-video w-full" />
            ) : (
              <video
                ref={liveRef}
                autoPlay
                muted
                playsInline
                className="aspect-video w-full -scale-x-100"
              />
            )}
            {phase === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('starting')}
              </div>
            )}
            {phase === 'recording' && (
              <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">
                <Circle className="h-2.5 w-2.5 animate-pulse fill-red-500 text-red-500" />
                {t('recording')} {clock(elapsed)}
              </div>
            )}
          </div>
        )}

        {cameras.length > 1 && (phase === 'ready' || phase === 'starting') && (
          <Select value={cameraId ?? cameras[0]?.deviceId} onValueChange={setCameraId}>
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
              <Button type="button" variant="outline" onClick={retake}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                {t('retake')}
              </Button>
              <Button type="button" onClick={acceptTake}>
                {t('use')}
              </Button>
            </>
          ) : phase === 'recording' ? (
            <Button type="button" variant="destructive" onClick={() => recorderRef.current?.stop()}>
              <Square className="mr-1.5 h-4 w-4 fill-current" />
              {t('stop')}
            </Button>
          ) : phase !== 'failed' ? (
            <Button type="button" onClick={startRecording} disabled={phase !== 'ready'}>
              <Circle className="mr-1.5 h-4 w-4 fill-red-500 text-red-500" />
              {t('start')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
