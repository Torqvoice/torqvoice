'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Activity,
  Camera,
  Eye,
  EyeOff,
  FileText,
  Film,
  Loader2,
  Play,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { addServiceAttachment } from '@/features/vehicles/Actions/addServiceAttachment'
import { updateServiceAttachment } from '@/features/vehicles/Actions/updateServiceAttachment'
import { deleteServiceAttachment } from '@/features/vehicles/Actions/serviceActions'
import { SendPhotoToWhatsapp } from '@/features/whatsapp/Components/SendPhotoToWhatsapp'
import { compressImage } from '@/lib/compress-image'
import { isDropoffSlot } from '@/lib/dropoff-slots'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { ImageCarousel } from '../../service-detail/ImageCarousel'
import { formatFileSize } from '../../service-detail/types'
import type { Attachment } from '../service-page-types'

export type MediaKind = 'image' | 'document' | 'diagnostic' | 'video' | 'dropoff'

const KINDS: Record<
  MediaKind,
  { icon: LucideIcon; accept: string; types: (type: string) => boolean; tint: string }
> = {
  image: {
    icon: Camera,
    accept: '.jpg,.jpeg,.png,.webp',
    types: (type) => ['image/jpeg', 'image/png', 'image/webp'].includes(type),
    tint: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  document: {
    icon: FileText,
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt',
    types: () => true,
    tint: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  },
  diagnostic: {
    icon: Activity,
    accept: '.pdf,.csv,.txt',
    types: () => true,
    tint: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  },
  // The car as it arrived. Photographs, like 'image', but a record for the
  // workshop rather than something for the invoice.
  dropoff: {
    icon: Camera,
    accept: '.jpg,.jpeg,.png,.webp',
    types: (type) => ['image/jpeg', 'image/png', 'image/webp'].includes(type),
    tint: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  video: {
    icon: Film,
    accept: '.mp4,.webm,.mov',
    types: (type) => type.startsWith('video/'),
    tint: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
}

type Result<T = unknown> = { success: boolean; data?: T; error?: string }

/**
 * Where the tiles are saved. A work order's own actions unless the grid is
 * handed another record's, which is how the inspection page shows its files
 * with the same tiles.
 */
export interface MediaStore {
  add: (attachment: {
    fileName: string
    fileUrl: string
    fileType: string
    fileSize: number
    category: MediaKind
    includeInInvoice: boolean
  }) => Promise<Result<Attachment>>
  update: (input: {
    id: string
    includeInInvoice?: boolean
    description?: string
  }) => Promise<Result>
  remove: (id: string) => Promise<Result>
}

function serviceStore(serviceRecordId: string): MediaStore {
  return {
    add: (attachment) =>
      addServiceAttachment({ serviceRecordId, attachment }) as Promise<Result<Attachment>>,
    update: (input) => updateServiceAttachment(input),
    remove: (id) => deleteServiceAttachment(id),
  }
}

interface MediaGridProps {
  kind: MediaKind
  serviceRecordId: string
  /** Saves somewhere other than the work order's attachments. */
  store?: MediaStore
  files: Attachment[]
  /** The plan's cap for this kind of file; absent means no cap. */
  max?: number
  /** Photos can be sent to the customer over WhatsApp when there is one. */
  customerId?: string
}

/**
 * One kind of file on the job, as tiles: what it is, what it is called, when
 * it arrived, and whether the customer gets to see it. The last tile is the
 * way in, for a click or a drop. The same uploads, limits and actions as the
 * classic page's tabs; only the drawing is new.
 *
 * "Customer can see" is the file's include-on-invoice switch under the name
 * the customer would give it: a marked file is printed on the invoice and
 * shown on the shared link, an unmarked one stays in the workshop.
 */
export function MediaGrid({
  kind,
  serviceRecordId,
  store: customStore,
  files,
  max,
  customerId,
}: MediaGridProps) {
  const store = customStore ?? serviceStore(serviceRecordId)
  const t = useTranslations('service')
  const router = useRouter()
  const { formatDate, formatDateTime } = useFormatDate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Attachment[]>(files)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState<Attachment | null>(null)

  // The tiles follow the job: a photo filed under a concern elsewhere on the
  // page arrives with the refreshed record and belongs here too.
  const savedKey = files.map((f) => `${f.id}:${f.includeInInvoice}`).join(',')
  useEffect(() => {
    setItems(files)
  }, [savedKey]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the ids, not the array's identity

  const config = KINDS[kind]
  const Icon = config.icon
  const atLimit = max !== undefined && items.length >= max
  const isPhotos = kind === 'image' || kind === 'dropoff'

  // A drop-off photo taken from the phone's list carries which shot it is as
  // its description ('front', 'odometer'). That is shown in words, and stays
  // the shot's name until somebody types a caption of their own.
  const captionOf = (file: Attachment) =>
    kind === 'dropoff' && isDropoffSlot(file.description)
      ? t(`photoHandoff.dropoff.slots.${file.description}`)
      : file.description || ''

  const upload = async (list: FileList | File[]) => {
    let chosen = Array.from(list)
    const refused = chosen.filter((file) => !config.types(file.type))
    if (refused.length > 0) {
      toast.error(t('modern.media.wrongType', { names: refused.map((f) => f.name).join(', ') }))
      chosen = chosen.filter((file) => config.types(file.type))
    }
    if (max !== undefined) {
      const room = max - items.length
      if (room <= 0) {
        toast.error(t('modern.media.limit', { count: items.length, max }))
        return
      }
      if (chosen.length > room) {
        toast.warning(
          t(isPhotos ? 'images.onlyUploading' : 'documents.onlyUploading', {
            count: room,
          })
        )
        chosen = chosen.slice(0, room)
      }
    }
    if (chosen.length === 0) return

    setUploading(true)
    let added = 0
    for (let file of chosen) {
      try {
        if (isPhotos) file = await compressImage(file)
        const body = new FormData()
        body.append('file', file)
        const res = await fetch('/api/protected/upload/service-files', { method: 'POST', body })
        if (!res.ok) {
          const err = await res.json().catch(() => null)
          toast.error(err?.error || t('modern.media.failed', { name: file.name }))
          continue
        }
        const data = await res.json()
        const result = await store.add({
          fileName: data.fileName,
          fileUrl: data.url,
          fileType: data.fileType,
          fileSize: data.fileSize,
          category: kind,
          // Shown to the customer unless somebody says otherwise, as the
          // classic tabs do. For a video that means the shared link, which
          // plays it; the printed invoice has nothing to draw for one.
          // A drop-off photo is the workshop's own record, so it starts hidden.
          includeInInvoice: kind !== 'dropoff',
        })
        if (result.success && result.data) {
          setItems((prev) => [...prev, result.data as Attachment])
          added++
        } else {
          toast.error(result.error || t('modern.media.failed', { name: file.name }))
        }
      } catch {
        toast.error(t('modern.media.failed', { name: file.name }))
      }
    }
    setUploading(false)
    if (added > 0) {
      toast.success(t('modern.media.added', { count: added }))
      router.refresh()
    }
  }

  const toggleVisible = async (file: Attachment) => {
    const next = !file.includeInInvoice
    setItems((prev) => prev.map((f) => (f.id === file.id ? { ...f, includeInInvoice: next } : f)))
    const result = await store.update({ id: file.id, includeInInvoice: next })
    if (!result.success) {
      setItems((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, includeInInvoice: !next } : f))
      )
      toast.error(result.error || t('images.failedUpdate'))
    }
  }

  const remove = async (file: Attachment) => {
    setBusyId(file.id)
    const result = await store.remove(file.id)
    setBusyId(null)
    if (result.success) {
      setItems((prev) => prev.filter((f) => f.id !== file.id))
      router.refresh()
    } else {
      toast.error(result.error || t('attachments.failedDelete'))
    }
  }

  const saveCaption = async (file: Attachment, caption: string) => {
    if ((file.description ?? '') === caption || captionOf(file) === caption) return
    setItems((prev) => prev.map((f) => (f.id === file.id ? { ...f, description: caption } : f)))
    await store.update({ id: file.id, description: caption })
  }

  const tileAction =
    'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background disabled:cursor-default'

  return (
    <div className="grid grid-cols-2 gap-3 p-5 pt-4 @xl:grid-cols-3 @3xl:grid-cols-4">
      {items.map((file, index) => {
        const isImage = file.fileType.startsWith('image/')
        const isVideo = file.fileType.startsWith('video/')
        return (
          <div
            key={file.id}
            data-testid="media-tile"
            className="group/tile flex min-w-0 flex-col overflow-hidden rounded-lg border border-card-edge bg-card"
          >
            <div className={cn('relative flex h-28 items-center justify-center', config.tint)}>
              {isImage ? (
                <button
                  type="button"
                  onClick={() => setCarouselIndex(index)}
                  className="h-full w-full cursor-zoom-in"
                  aria-label={file.description || file.fileName}
                >
                  <img
                    src={file.fileUrl}
                    alt={file.description || file.fileName}
                    className="h-full w-full object-cover"
                  />
                </button>
              ) : isVideo ? (
                // The first frame as the tile, and a player a click away:
                // the classic tab played video on the page, not in a new tab.
                <button
                  type="button"
                  onClick={() => setPlaying(file)}
                  className="relative h-full w-full cursor-pointer bg-black"
                  aria-label={file.description || file.fileName}
                >
                  <video
                    src={`${file.fileUrl}#t=0.1`}
                    preload="metadata"
                    muted
                    playsInline
                    className="pointer-events-none h-full w-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm">
                      <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
                    </span>
                  </span>
                </button>
              ) : (
                <a
                  href={file.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full w-full items-center justify-center"
                  aria-label={file.fileName}
                >
                  <Icon className="h-7 w-7" aria-hidden="true" />
                </a>
              )}

              {file.includeInInvoice && (
                <span className="pointer-events-none absolute left-2 top-2 rounded bg-foreground px-1.5 py-0.5 text-[11px] font-semibold text-background">
                  {t('modern.media.customerCanSee')}
                </span>
              )}

              {/* Always there on a touch screen, on hover where there is one. */}
              <div className="absolute right-1.5 top-1.5 flex gap-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/tile:opacity-100 [@media(hover:hover)]:group-hover/tile:opacity-100">
                <button
                  type="button"
                  onClick={() => void toggleVisible(file)}
                  aria-pressed={file.includeInInvoice}
                  title={
                    file.includeInInvoice
                      ? t('modern.media.hideFromCustomer')
                      : t('modern.media.showToCustomer')
                  }
                  aria-label={
                    file.includeInInvoice
                      ? t('modern.media.hideFromCustomer')
                      : t('modern.media.showToCustomer')
                  }
                  className={tileAction}
                >
                  {/* The icon is the state, the tooltip is the action: an open
                      eye means the customer can see this. Drawn the other way
                      round it read as "hidden" on every visible photo. */}
                  {file.includeInInvoice ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(file)}
                  disabled={busyId === file.id}
                  title={t('header.delete')}
                  aria-label={t('header.delete')}
                  className={cn(tileAction, 'hover:text-destructive')}
                >
                  {busyId === file.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="min-w-0 px-3 py-2">
              {/* The caption is the file's name until somebody gives it a
                  better one; it reads as text and is a field when clicked. */}
              <input
                defaultValue={captionOf(file)}
                placeholder={file.fileName}
                aria-label={t('images.description')}
                onBlur={(e) => void saveCaption(file, e.target.value.trim())}
                className="w-full truncate rounded-sm bg-transparent text-[13px] font-medium outline-none placeholder:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                  {/* To the minute for a drop-off photo: when it was taken is
                      the point of it. */}
                  {kind === 'dropoff' ? formatDateTime(file.createdAt) : formatDate(file.createdAt)}{' '}
                  · {formatFileSize(file.fileSize)}
                </p>
                {isImage && customerId && !customStore && (
                  <SendPhotoToWhatsapp
                    customerId={customerId}
                    fileUrl={file.fileUrl}
                    fileName={file.fileName}
                    serviceRecordId={serviceRecordId}
                  />
                )}
              </div>
            </div>
          </div>
        )
      })}

      {atLimit ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/25 p-3 text-center text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            {t('modern.media.limit', { count: items.length, max: max ?? 0 })}
          </span>
          <span>{t('images.upgradePrompt')}</span>
        </div>
      ) : (
        <button
          type="button"
          data-testid="media-add"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files)
          }}
          className={cn(
            'flex min-h-40 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-3 text-center text-[13px] text-muted-foreground transition-colors disabled:cursor-default',
            dragging
              ? 'border-primary bg-primary/10'
              : 'border-muted-foreground/25 bg-muted/30 hover:border-muted-foreground/50'
          )}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Upload className="h-6 w-6" aria-hidden="true" />
          )}
          <span className="font-semibold text-foreground">
            {uploading ? t('images.uploading') : t(`modern.media.add.${kind}`)}
          </span>
          <span className="text-xs">{t('modern.media.dropHint')}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={config.accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files)
          e.target.value = ''
        }}
      />

      <Dialog open={playing !== null} onOpenChange={(open) => !open && setPlaying(null)}>
        <DialogContent className="max-w-3xl p-3" aria-describedby={undefined}>
          <DialogTitle className="truncate pr-8 text-sm">
            {playing?.description || playing?.fileName}
          </DialogTitle>
          {playing && (
            <video
              src={playing.fileUrl}
              controls
              autoPlay
              playsInline
              className="max-h-[75vh] w-full rounded-md bg-black"
            />
          )}
        </DialogContent>
      </Dialog>

      {isPhotos && (
        <ImageCarousel
          images={items}
          currentIndex={carouselIndex}
          onClose={() => setCarouselIndex(null)}
          onChangeIndex={setCarouselIndex}
        />
      )}
    </div>
  )
}
