'use client'

import { GripVertical, ImageOff, Loader2, Trash2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { type EmailKind, kindSpec } from '../Lib/emailKinds'
import {
  EMAIL_FONT_IDS,
  EMAIL_IMAGE_MAX_WIDTH,
  EMAIL_IMAGE_MIN_WIDTH,
  EMAIL_LOGO_MAX_WIDTH,
  EMAIL_LOGO_MIN_WIDTH,
  BLOCK_ALIGNS,
  type BlockAlign,
  type EmailBlock,
  type EmailFontId,
  type EmailTheme,
  emailImagePublicPath,
  emailLogoPublicPath,
  SUMMARY_ROWS,
} from '../Lib/emailTemplate'
import { plainToRich } from '../Lib/richText'
import { Choice, ColorField, Group, Note, Row, Slider, Toggle } from './EmailDesignerControls'
import { EmailRichEditor } from './EmailRichEditor'
import { TagField, TagPicker, useTagTargets } from './TagPicker'

export interface InspectorProps {
  kind: EmailKind
  subject: string
  theme: EmailTheme
  selected: EmailBlock | null
  /** Everything wrong with the template right now, in the workshop's words. */
  problems: string[]
  canRemove: boolean
  onSubject: (subject: string) => void
  onTheme: (patch: Partial<EmailTheme>) => void
  onBlock: (id: string, patch: Partial<EmailBlock>) => void
  onRemove: (id: string) => void
}

const INSPECTOR_MIN_WIDTH = 300
const INSPECTOR_MAX_WIDTH = 720
const INSPECTOR_DEFAULT_WIDTH = 360
const INSPECTOR_WIDTH_KEY = 'email-designer.inspector-width'

const clampWidth = (value: number) =>
  Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, Math.round(value)))

/**
 * How wide the panel is, remembered per browser. Read after mount so the
 * server and the first client paint agree; storage may be unavailable or
 * full, and neither is worth more than the default width.
 */
function useInspectorWidth() {
  const [width, setWidth] = useState(INSPECTOR_DEFAULT_WIDTH)

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(INSPECTOR_WIDTH_KEY))
      if (Number.isFinite(stored) && stored > 0) setWidth(clampWidth(stored))
    } catch {
      // Storage refused; the default width is fine.
    }
  }, [])

  const remember = useCallback((value: number | null) => {
    try {
      if (value === null) window.localStorage.removeItem(INSPECTOR_WIDTH_KEY)
      else window.localStorage.setItem(INSPECTOR_WIDTH_KEY, String(value))
    } catch {
      // Storage refused; the width lasts for the tab.
    }
  }, [])

  return { width, setWidth, remember }
}

/**
 * The right-hand panel: the selected block's words, or the subject and the
 * look when nothing is selected. Keyed on the selection so the tag picker's
 * idea of the last-focused field starts over with each block.
 *
 * Its left edge is a handle: the panel can be dragged wider for a long
 * paragraph and back for a wide preview, and the width is remembered.
 */
export function EmailDesignerInspector(props: InspectorProps) {
  const t = useTranslations('settings.emailTemplates')
  const { width, setWidth, remember } = useInspectorWidth()
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    drag.current = { startX: event.clientX, startWidth: width }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    setWidth(clampWidth(drag.current.startWidth + (drag.current.startX - event.clientX)))
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
    remember(width)
  }

  const reset = () => {
    setWidth(INSPECTOR_DEFAULT_WIDTH)
    remember(null)
  }

  return (
    <div
      className="relative flex flex-none flex-col border-l border-border bg-card text-card-foreground"
      style={{ width }}
    >
      {/* Something for the pointer to land on while it crosses the preview's frame. */}
      {dragging && <div className="fixed inset-0 z-40 cursor-col-resize" />}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={INSPECTOR_MIN_WIDTH}
        aria-valuemax={INSPECTOR_MAX_WIDTH}
        title={t('resizeHint')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
        className="group absolute inset-y-0 -left-1.5 z-50 w-3 cursor-col-resize"
      >
        <div
          className={cn(
            'absolute inset-y-0 left-[5px] w-px bg-border transition-colors group-hover:bg-primary',
            dragging && 'bg-primary'
          )}
        />
        {/* A grip in the middle of the edge, so the edge reads as something to take hold of. */}
        <div
          className={cn(
            'absolute top-1/2 left-1/2 flex h-9 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-xs transition-colors group-hover:border-primary group-hover:text-primary',
            dragging && 'border-primary text-primary'
          )}
        >
          <GripVertical size={12} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <InspectorBody key={props.selected?.id ?? 'settings'} {...props} />
      </div>
    </div>
  )
}

function InspectorBody({
  kind,
  subject,
  theme,
  selected,
  problems,
  canRemove,
  onSubject,
  onTheme,
  onBlock,
  onRemove,
}: InspectorProps) {
  const t = useTranslations('settings.emailTemplates')
  const targets = useTagTargets()
  const spec = kindSpec(kind)

  const title = selected ? t(`blocks.${selected.type}`) : t('subjectAndTheme')
  const hasTagFields =
    !selected ||
    ['heading', 'paragraph', 'callout', 'attachment_note', 'button', 'image'].includes(
      selected.type
    )

  return (
    <div className="space-y-4 p-3.5">
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {!selected && <Note>{t('settingsSubtitle')}</Note>}
      </div>

      {problems.length > 0 && (
        <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs leading-snug text-destructive">
          {problems.map((problem) => (
            <div key={problem}>{problem}</div>
          ))}
        </div>
      )}

      {selected ? (
        <BlockFields
          block={selected}
          kind={kind}
          theme={theme}
          onTheme={onTheme}
          targets={targets}
          onBlock={onBlock}
        />
      ) : (
        <>
          <TagField
            id="subject"
            label={t('subject')}
            value={subject}
            onChange={onSubject}
            targets={targets}
            maxLength={200}
          />
          <ThemeFields theme={theme} onTheme={onTheme} />
        </>
      )}

      {hasTagFields && (
        <Group title={t('tagsTitle')}>
          <Note>{t('tagsHint')}</Note>
          <TagPicker tags={spec.tags} onInsert={targets.insert} />
        </Group>
      )}

      {selected && (
        <div className="border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canRemove}
            onClick={() => onRemove(selected.id)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 /> {t('removeBlock')}
          </Button>
        </div>
      )}
    </div>
  )
}

function BlockFields({
  block,
  kind,
  theme,
  targets,
  onBlock,
  onTheme,
}: {
  block: EmailBlock
  kind: EmailKind
  theme: EmailTheme
  targets: ReturnType<typeof useTagTargets>
  onBlock: (id: string, patch: Partial<EmailBlock>) => void
  onTheme: (patch: Partial<EmailTheme>) => void
}) {
  const t = useTranslations('settings.emailTemplates')
  const spec = kindSpec(kind)

  switch (block.type) {
    case 'header':
      return (
        <>
          <LogoFields theme={theme} onTheme={onTheme} />
          <Group title={t('logo.position')}>
            <AlignChoice
              value={block.align ?? 'left'}
              onChange={(align) => onBlock(block.id, { align })}
            />
            <Row label={t('headerRule')}>
              <Toggle
                label={t('headerRule')}
                on={block.rule !== false}
                onChange={(rule) => onBlock(block.id, { rule })}
              />
            </Row>
            <Note>{t('headerRuleHint')}</Note>
          </Group>
          <Note>{t('blockNotes.header')}</Note>
        </>
      )

    case 'contact_footer':
      return <Note>{t('blockNotes.contact_footer')}</Note>

    case 'divider':
      return <Note>{t('blockNotes.divider')}</Note>

    case 'heading':
    case 'paragraph':
    case 'callout':
    case 'attachment_note':
      return (
        <div className="space-y-2">
          <EmailRichEditor
            id={`${block.id}-text`}
            label={t('text')}
            // A block written before formatting existed opens as its plain
            // words; the first edit writes the tree and leaves `text` alone.
            value={block.content ?? plainToRich(block.text ?? '')}
            theme={theme}
            targets={targets}
            onChange={(content) => onBlock(block.id, { content })}
          />
          {block.type === 'attachment_note' && <Note>{t('blockNotes.attachment_note')}</Note>}
          {block.type === 'callout' && <Note>{t('blockNotes.callout')}</Note>}
        </div>
      )

    case 'button':
      return (
        <div className="space-y-2">
          <Row label={t('logo.position')}>
            <AlignChoice
              value={block.align ?? 'left'}
              onChange={(align) => onBlock(block.id, { align })}
            />
          </Row>
          <TagField
            id={`${block.id}-label`}
            label={t('buttonLabel')}
            value={block.label ?? ''}
            onChange={(label) => onBlock(block.id, { label })}
            targets={targets}
            maxLength={120}
          />
          <TagField
            id={`${block.id}-href`}
            label={t('buttonHref')}
            value={block.href ?? ''}
            onChange={(href) => onBlock(block.id, { href })}
            targets={targets}
            maxLength={500}
            mono
          />
          <Note>{t('blockNotes.button')}</Note>
        </div>
      )

    case 'image':
      return <ImageFields block={block} theme={theme} targets={targets} onBlock={onBlock} />

    case 'spacer':
      return (
        <Slider
          label={t('spacerHeight')}
          value={block.height ?? 16}
          min={0}
          max={120}
          suffix="px"
          onChange={(height) => onBlock(block.id, { height })}
        />
      )

    case 'document_summary': {
      // No list means every row; the first change writes the list out.
      const shown = new Set(block.rows ?? SUMMARY_ROWS)
      return (
        <div className="space-y-2">
          <Note>{t('blockNotes.document_summary')}</Note>
          {SUMMARY_ROWS.map((row) => (
            <Row key={row} label={t(`summaryRows.${row}`)}>
              <Toggle
                label={t(`summaryRows.${row}`)}
                on={shown.has(row)}
                onChange={(on) => {
                  const rows = SUMMARY_ROWS.filter((r) => (r === row ? on : shown.has(r)))
                  onBlock(block.id, { rows })
                }}
              />
            </Row>
          ))}
          {!spec.hasSummary && <Note>{t('blockNotes.summaryUnused')}</Note>}
        </div>
      )
    }

    default:
      return null
  }
}

function ThemeFields({
  theme,
  onTheme,
}: {
  theme: EmailTheme
  onTheme: (patch: Partial<EmailTheme>) => void
}) {
  const t = useTranslations('settings.emailTemplates')
  return (
    <>
      <Group title={t('theme.colors')}>
        <ColorField
          label={t('theme.primaryColor')}
          value={theme.primaryColor}
          onChange={(primaryColor) => onTheme({ primaryColor })}
        />
        <ColorField
          label={t('theme.textColor')}
          value={theme.textColor}
          onChange={(textColor) => onTheme({ textColor })}
        />
        <ColorField
          label={t('theme.mutedColor')}
          value={theme.mutedColor}
          onChange={(mutedColor) => onTheme({ mutedColor })}
        />
        <ColorField
          label={t('theme.backgroundColor')}
          value={theme.backgroundColor}
          onChange={(backgroundColor) => onTheme({ backgroundColor })}
        />
        <ColorField
          label={t('theme.panelColor')}
          value={theme.panelColor}
          onChange={(panelColor) => onTheme({ panelColor })}
        />
      </Group>

      <Group title={t('theme.typography')}>
        <Row label={t('theme.font')}>
          <Select
            value={theme.fontFamily}
            onValueChange={(value) => onTheme({ fontFamily: value as EmailFontId })}
          >
            <SelectTrigger size="sm" aria-label={t('theme.font')} className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_FONT_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {t(`theme.fonts.${id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Note>{t('theme.fontHint')}</Note>
      </Group>

      <Group title={t('theme.shapes')}>
        <Slider
          label={t('theme.buttonRadius')}
          value={theme.buttonRadius}
          min={0}
          max={32}
          suffix="px"
          onChange={(buttonRadius) => onTheme({ buttonRadius })}
        />
        <Row label={t('theme.topBar')}>
          <Toggle
            label={t('theme.topBar')}
            on={theme.topBar !== false}
            onChange={(topBar) => onTheme({ topBar })}
          />
        </Row>
        <Note>{t('theme.topBarHint')}</Note>
      </Group>
    </>
  )
}

const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp'
const LOGO_MAX_BYTES = 4 * 1024 * 1024
const IMAGE_ACCEPT = LOGO_ACCEPT
const IMAGE_MAX_BYTES = 10 * 1024 * 1024

/**
 * An upload that outlives its panel. Discard, or picking another block,
 * unmounts the fields while the request is out; the answer must then be
 * dropped rather than written into whatever the template has become. The
 * request itself is aborted, and `cancelled` covers the window between the
 * cleanup and the rejection reaching the caller.
 */
function useUploadGuard() {
  const cancelled = useRef(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
      controller.current?.abort()
    }
  }, [])

  /** A signal for the next upload; an earlier one still out is abandoned. */
  const begin = useCallback(() => {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    cancelled.current = false
    return next.signal
  }, [])

  return { begin, isCancelled: () => cancelled.current }
}

/** Sends one file to an upload route and returns the URL it was stored under. */
async function postUpload(
  route: string,
  file: File,
  signal: AbortSignal,
  fallbackError: string
): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch(route, { method: 'POST', body, signal })
  const json = (await response.json().catch(() => null)) as {
    url?: string
    error?: string
  } | null
  if (!response.ok || !json?.url) {
    throw new Error(json?.error || fallbackError)
  }
  return json.url
}

/** Left, centre or right, for a block that sits across the mail. */
function AlignChoice({
  value,
  onChange,
}: {
  value: BlockAlign
  onChange: (value: BlockAlign) => void
}) {
  const t = useTranslations('settings.emailTemplates')
  return (
    <Choice
      label={t('logo.position')}
      value={value}
      onChange={onChange}
      options={BLOCK_ALIGNS.map((align) => ({ value: align, label: t(`toolbar.align.${align}`) }))}
    />
  )
}

/**
 * The logo the header prints: its own upload, not the company logo, so it
 * can be trimmed and sized for a mail without touching the letterhead. The
 * server does the trimming and resizing; this only sends the file and keeps
 * the URL it answers with.
 */
function LogoFields({
  theme,
  onTheme,
}: {
  theme: EmailTheme
  onTheme: (patch: Partial<EmailTheme>) => void
}) {
  const t = useTranslations('settings.emailTemplates')
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const guard = useUploadGuard()
  const src = emailLogoPublicPath(theme.logoUrl)

  const upload = async (file: File) => {
    if (file.size > LOGO_MAX_BYTES) {
      toast.error(t('logo.tooLarge'))
      return
    }
    setUploading(true)
    const signal = guard.begin()
    try {
      const url = await postUpload(
        '/api/protected/upload/email-logo',
        file,
        signal,
        t('logo.uploadFailed')
      )
      if (guard.isCancelled()) return
      onTheme({ logoUrl: url, showLogo: true })
    } catch (error) {
      if (guard.isCancelled()) return
      toast.error(error instanceof Error && error.message ? error.message : t('logo.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Group title={t('logo.title')}>
      <div
        className="flex min-h-[88px] items-center justify-center overflow-hidden rounded-md border border-dashed border-border p-3"
        style={{ background: theme.backgroundColor }}
      >
        {src ? (
          <img
            src={src}
            alt={t('logo.title')}
            style={{ width: theme.logoWidth, maxWidth: '100%', height: 'auto', display: 'block' }}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <ImageOff size={18} />
            <span>{t('logo.empty')}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          ref={input}
          type="file"
          accept={LOGO_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void upload(file)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {uploading ? t('logo.uploading') : src ? t('logo.replace') : t('logo.upload')}
        </Button>
        {src && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploading}
            onClick={() => onTheme({ logoUrl: '' })}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 /> {t('logo.remove')}
          </Button>
        )}
      </div>
      <Note>{t('logo.hint')}</Note>

      <Slider
        label={t('logo.width')}
        value={theme.logoWidth}
        min={EMAIL_LOGO_MIN_WIDTH}
        max={EMAIL_LOGO_MAX_WIDTH}
        suffix="px"
        onChange={(logoWidth) => onTheme({ logoWidth })}
      />

      <Row label={t('theme.showLogo')}>
        <Toggle
          label={t('theme.showLogo')}
          on={theme.showLogo}
          onChange={(showLogo) => onTheme({ showLogo })}
        />
      </Row>
      <Note>{t('theme.showLogoHint')}</Note>
    </Group>
  )
}

/**
 * A picture in the body of the mail. The server compresses and resizes what
 * is uploaded; this sends the file, keeps the URL it answers with, and lets
 * the picture be described, sized, placed and linked. Nothing is deleted
 * from here: a picture no block refers to is swept once the template is
 * saved, so removing one is only a matter of forgetting its URL.
 */
function ImageFields({
  block,
  theme,
  targets,
  onBlock,
}: {
  block: EmailBlock
  theme: EmailTheme
  targets: ReturnType<typeof useTagTargets>
  onBlock: (id: string, patch: Partial<EmailBlock>) => void
}) {
  const t = useTranslations('settings.emailTemplates')
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const guard = useUploadGuard()
  const src = emailImagePublicPath(block.src)
  const width = block.width ?? EMAIL_IMAGE_MAX_WIDTH

  const upload = async (file: File) => {
    if (file.size > IMAGE_MAX_BYTES) {
      toast.error(t('image.tooLarge'))
      return
    }
    setUploading(true)
    const signal = guard.begin()
    try {
      const url = await postUpload(
        '/api/protected/upload/email-image',
        file,
        signal,
        t('image.uploadFailed')
      )
      if (guard.isCancelled()) return
      onBlock(block.id, { src: url })
    } catch (error) {
      if (guard.isCancelled()) return
      toast.error(error instanceof Error && error.message ? error.message : t('image.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2.5">
      <div
        className="flex min-h-[88px] items-center justify-center overflow-hidden rounded-md border border-dashed border-border p-3"
        style={{ background: theme.backgroundColor }}
      >
        {src ? (
          <img
            src={src}
            alt={block.alt || t('blocks.image')}
            style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground">
            <ImageOff size={18} />
            <span>{t('image.empty')}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void upload(file)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {uploading ? t('image.uploading') : src ? t('image.replace') : t('image.upload')}
        </Button>
        {src && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploading}
            onClick={() => onBlock(block.id, { src: '' })}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 /> {t('image.remove')}
          </Button>
        )}
      </div>

      <TagField
        id={`${block.id}-alt`}
        label={t('image.alt')}
        value={block.alt ?? ''}
        onChange={(alt) => onBlock(block.id, { alt })}
        targets={targets}
        maxLength={200}
      />
      <Note>{t('image.altHint')}</Note>

      <Slider
        label={t('image.width')}
        value={width}
        min={EMAIL_IMAGE_MIN_WIDTH}
        max={EMAIL_IMAGE_MAX_WIDTH}
        suffix="px"
        onChange={(next) => onBlock(block.id, { width: next })}
      />
      <Note>{t('image.widthHint')}</Note>

      <Row label={t('logo.position')}>
        <AlignChoice
          value={block.align ?? 'center'}
          onChange={(align) => onBlock(block.id, { align })}
        />
      </Row>

      <TagField
        id={`${block.id}-href`}
        label={t('image.link')}
        value={block.href ?? ''}
        onChange={(href) => onBlock(block.id, { href })}
        targets={targets}
        maxLength={500}
        mono
      />
      <Note>{t('image.linkHint')}</Note>
      <Note>{t('blockNotes.image')}</Note>
    </div>
  )
}
