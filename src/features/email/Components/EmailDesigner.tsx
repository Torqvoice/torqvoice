'use client'

import {
  AlertTriangle,
  ArrowLeft,
  Code,
  Copy,
  FileText,
  Monitor,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Trash2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-dialog'
import { useGlassModal } from '@/components/glass-modal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  deleteEmailTemplate,
  saveEmailTemplate,
  sendTestEmail,
} from '../Actions/emailTemplateActions'
import { buildEmailSpec } from '../Lib/buildEmailSpec'
import { type EmailKind, kindSpec } from '../Lib/emailKinds'
import {
  EMAIL_BLOCK_TYPES,
  EMAIL_IMAGE_MAX_WIDTH,
  type EmailBlock,
  type EmailBlockType,
  type EmailTemplate,
  type EmailTheme,
  emailLogoPublicPath,
  type SavedEmailTemplate,
  templateText,
} from '../Lib/emailTemplate'
import { missingTags, unknownTags } from '../Lib/tags'
import { renderEmailHtml } from '../Render/renderEmailHtml'
import { renderEmailText } from '../Render/renderEmailText'
import type { SaveEmailTemplateInput } from '../Schema/emailTemplateSchema'
import { HEX_COLOR } from './EmailDesignerControls'
import { EmailDesignerInspector } from './EmailDesignerInspector'
import { EmailDesignerRail } from './EmailDesignerRail'
import { EmailPreview, type PreviewView, type PreviewWidth } from './EmailPreview'
import type { EmailSampleData } from './EmailThumbnail'

const SETTINGS_PAGE = '/settings/email-templates'

/** Blocks a mail has at most one of; the rest can repeat. */
const ONCE: ReadonlySet<EmailBlockType> = new Set([
  'header',
  'contact_footer',
  'document_summary',
  'attachment_note',
])

const THEME_COLORS: (keyof EmailTheme)[] = [
  'primaryColor',
  'textColor',
  'mutedColor',
  'backgroundColor',
  'panelColor',
]

function newBlockId(type: EmailBlockType): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36)
  return `${type}-${suffix}`
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const same = (a: EmailTemplate, b: EmailTemplate) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The email designer: one kind of mail, its blocks on the left, the mail in
 * the middle, the words and the look on the right.
 *
 * Everything is edited as one template object and rendered on every change
 * through the same builder and renderer a real send uses, so what the preview
 * shows is what arrives. Save writes the template and makes it the one this
 * kind sends with; the gallery is where a saved template is set aside.
 */
export function EmailDesigner({
  kind,
  preset,
  initialSaved,
  savedNames,
  activeId,
  sample,
  userEmail,
}: {
  kind: EmailKind
  /** The built-in template for this kind, in the workshop's language. */
  preset: EmailTemplate
  /** The saved template this tab opened on, or null for the preset. */
  initialSaved: SavedEmailTemplate | null
  /** The names already taken for this kind, so the dialog can say a save will update. */
  savedNames: { id: string; name: string }[]
  /** Which template the kind sends with right now. */
  activeId: string | null
  sample: EmailSampleData
  userEmail: string
}) {
  const t = useTranslations('settings.emailTemplates')
  const router = useRouter()
  const confirm = useConfirm()
  const openModal = useGlassModal((state) => state.open)
  const spec = kindSpec(kind)

  const [saved, setSaved] = useState<SavedEmailTemplate | null>(initialSaved)
  const [baseline, setBaseline] = useState<EmailTemplate>(() =>
    clone(initialSaved ? stripSaved(initialSaved) : preset)
  )
  const [template, setTemplate] = useState<EmailTemplate>(() => clone(baseline))
  const [selected, setSelected] = useState<string | null>(null)
  const [width, setWidth] = useState<PreviewWidth>('desktop')
  const [view, setView] = useState<PreviewView>('html')
  const [saving, setSaving] = useState(false)
  const [names, setNames] = useState(savedNames)

  const [naming, setNaming] = useState<'first' | 'copy' | null>(null)
  const [name, setName] = useState('')
  const [testOpen, setTestOpen] = useState(false)
  const [testEmail, setTestEmail] = useState(userEmail)
  const [sending, setSending] = useState(false)

  const dirty = !same(template, baseline)

  // A closed tab or a reload throws the work away; the browser asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // The preview, built the way a send is, filled with the sample data. The
  // logo is the template's own, fetched from the public route as a mail
  // client would fetch it.
  const { html, text, subject } = useMemo(() => {
    const built = buildEmailSpec(template, {
      values: sample.values,
      summary: sample.summary,
      logoUrl: emailLogoPublicPath(template.theme.logoUrl),
      attached: spec.hasAttachment,
    })
    return {
      html: renderEmailHtml(built, { marked: true }),
      text: renderEmailText(built),
      subject: built.subject,
    }
  }, [template, sample, spec.hasAttachment])

  // The first line of the mail after the sender's name, which is what an
  // inbox shows beside the subject.
  const previewLine = useMemo(() => {
    const lines = text.split('\n').map((line) => line.trim())
    const start = lines[0] === (sample.values.workshop_name ?? '').trim() ? 1 : 0
    return lines.slice(start).find(Boolean) ?? ''
  }, [text, sample.values.workshop_name])

  // Everything that keeps the template from being saved, worded for the
  // panel and for the pill beside Save.
  const problems = useMemo(() => {
    const list: string[] = []
    const all = templateText(template)
    const unknown = unknownTags(all, spec.tags)
    const missing = missingTags(all, spec.required)
    if (unknown.length) {
      list.push(t('unknownTags', { tags: unknown.map((tag) => `{${tag}}`).join(', ') }))
    }
    if (missing.length) {
      list.push(t('missingTags', { tags: missing.map((tag) => `{${tag}}`).join(', ') }))
    }
    if (!template.subject.trim()) list.push(t('subjectRequired'))
    if (THEME_COLORS.some((key) => !HEX_COLOR.test(String(template.theme[key])))) {
      list.push(t('theme.invalidColor'))
    }
    return list
  }, [template, spec, t])

  const patchBlock = useCallback((id: string, patch: Partial<EmailBlock>) => {
    setTemplate((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    }))
  }, [])

  const toggleBlock = useCallback((id: string) => {
    setTemplate((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) =>
        block.id === id ? { ...block, visible: block.visible === false } : block
      ),
    }))
  }, [])

  const moveBlock = useCallback((draggedId: string, toIndex: number) => {
    setTemplate((prev) => {
      const blocks = [...prev.blocks]
      const from = blocks.findIndex((block) => block.id === draggedId)
      if (from === -1) return prev
      const [moved] = blocks.splice(from, 1)
      blocks.splice(Math.max(0, Math.min(blocks.length, toIndex)), 0, moved)
      return { ...prev, blocks }
    })
  }, [])

  const removeBlock = useCallback(
    (id: string) => {
      setTemplate((prev) =>
        prev.blocks.length > 1
          ? { ...prev, blocks: prev.blocks.filter((block) => block.id !== id) }
          : prev
      )
      if (selected === id) setSelected(null)
    },
    [selected]
  )

  /**
   * A new block lands after the selected one, or above the footer when
   * nothing is selected: the end of the mail is the sign-off, not where
   * new words go.
   */
  const addBlock = useCallback(
    (type: EmailBlockType) => {
      const block: EmailBlock = { id: newBlockId(type), type }
      if (type === 'attachment_note') {
        block.text = preset.blocks.find((b) => b.type === 'attachment_note')?.text ?? ''
      } else if (type === 'heading' || type === 'paragraph' || type === 'callout') {
        block.text = ''
      } else if (type === 'button') {
        block.label = ''
        block.href = spec.tags.includes('share_link')
          ? '{share_link}'
          : spec.tags.includes('signin_link')
            ? '{signin_link}'
            : '{portal_link}'
      } else if (type === 'spacer') {
        block.height = 16
      } else if (type === 'image') {
        block.align = 'center'
        block.width = EMAIL_IMAGE_MAX_WIDTH
        block.alt = ''
      }
      setTemplate((prev) => {
        const blocks = [...prev.blocks]
        const after = selected ? blocks.findIndex((b) => b.id === selected) : -1
        const footer = blocks.findIndex((b) => b.type === 'contact_footer')
        const at = after >= 0 ? after + 1 : footer >= 0 ? footer : blocks.length
        blocks.splice(at, 0, block)
        return { ...prev, blocks }
      })
      setSelected(block.id)
    },
    [preset.blocks, selected, spec.tags]
  )

  const addable = useMemo(() => {
    const present = new Set(template.blocks.map((block) => block.type))
    return EMAIL_BLOCK_TYPES.filter((type) => {
      if (ONCE.has(type) && present.has(type)) return false
      if (type === 'document_summary' && !spec.hasSummary) return false
      if (type === 'attachment_note' && !spec.hasAttachment) return false
      return true
    })
  }, [template.blocks, spec])

  const inputFor = (templateName: string, id?: string): SaveEmailTemplateInput => ({
    id,
    kind,
    name: templateName,
    subject: template.subject,
    blocks: template.blocks,
    theme: template.theme,
  })

  /**
   * From the preset, Save asks for a name and writes a new row; from a saved
   * template it updates that row in place. Either way the row becomes the
   * one this kind sends with, which is what the server does on save.
   */
  const save = async (mode: 'update' | 'first' | 'copy', nameOverride?: string) => {
    if (problems.length) return
    if (mode !== 'update' && !nameOverride) {
      setName(mode === 'first' ? template.name || preset.name : '')
      setNaming(mode)
      return
    }
    const id = mode === 'update' ? saved?.id : undefined
    const templateName = mode === 'update' ? (saved?.name ?? template.name) : (nameOverride ?? '')

    setSaving(true)
    try {
      const result = await saveEmailTemplate(inputFor(templateName, id))
      if (!result.success || !result.data) {
        throw new Error(result.success ? 'No template returned' : result.error)
      }
      const row = result.data
      const next = stripSaved(row)
      setSaved(row)
      setTemplate(clone(next))
      setBaseline(clone(next))
      setNames((prev) => [{ id: row.id, name: row.name }, ...prev.filter((n) => n.id !== row.id)])
      if (row.id !== saved?.id) {
        router.replace(`/email-designer?kind=${kind}&template=${row.id}`)
      }
      toast.success(t('saved', { name: row.name }))
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t('couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    setTemplate(clone(baseline))
    setSelected(null)
  }

  const leave = async () => {
    if (dirty) {
      const go = await confirm({
        title: t('leaveTitle'),
        description: t('leaveBody'),
        confirmLabel: t('leaveConfirm'),
      })
      if (!go) return
    }
    router.push(SETTINGS_PAGE)
  }

  const remove = async () => {
    if (!saved) return
    const ok = await confirm({
      title: t('deleteTitle'),
      description: t('deleteConfirm', { name: saved.name }),
      confirmLabel: t('delete'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteEmailTemplate(saved.id)
    if (!result.success) {
      toast.error(t('couldNotDelete'))
      return
    }
    // Nothing left to keep editing, and the beforeunload guard has nothing
    // left to protect: the baseline is what the row was.
    setBaseline(template)
    toast.success(t('deleted', { name: saved.name }))
    router.push(SETTINGS_PAGE)
  }

  const sendTest = async () => {
    setSending(true)
    try {
      const result = await sendTestEmail(inputFor(saved?.name ?? template.name), testEmail)
      if (!result.success) throw new Error(result.error)
      setTestOpen(false)
      openModal(
        'success',
        t('testDialog.sentTitle'),
        t('testDialog.sentBody', { email: testEmail })
      )
    } catch (error) {
      openModal(
        'error',
        t('testDialog.failedTitle'),
        error instanceof Error && error.message ? error.message : t('testDialog.failedBody')
      )
    } finally {
      setSending(false)
    }
  }

  const selectedBlock = selected
    ? (template.blocks.find((block) => block.id === selected) ?? null)
    : null
  const nameTaken = names.some((n) => n.name.trim().toLowerCase() === name.trim().toLowerCase())
  const canSave = dirty && problems.length === 0 && !saving
  const inUse = saved ? activeId === saved.id : activeId === null

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TooltipProvider delayDuration={400}>
        <header className="grid h-[52px] flex-none grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border bg-card px-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => void leave()}>
              <ArrowLeft /> {t('backToSettings')}
            </Button>
            <Separator orientation="vertical" className="h-5!" />
            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="flex-none text-muted-foreground">{t(`kinds.${kind}.name`)}</span>
              <span className="flex-none text-muted-foreground/60">/</span>
              <span className="truncate font-semibold">{saved ? saved.name : t('builtIn')}</span>
              {dirty && <span className="flex-none text-muted-foreground">{t('unsaved')}</span>}
              {inUse && !dirty && (
                <Badge className="flex-none text-[10.5px] font-semibold">{t('inUse')}</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <IconToggleGroup
              value={width}
              onChange={setWidth}
              options={[
                { value: 'desktop', label: t('desktopTooltip'), icon: <Monitor /> },
                { value: 'mobile', label: t('mobileTooltip'), icon: <Smartphone /> },
              ]}
            />
            <IconToggleGroup
              value={view}
              onChange={setView}
              options={[
                { value: 'html', label: t('htmlViewTooltip'), icon: <Code /> },
                { value: 'text', label: t('textViewTooltip'), icon: <FileText /> },
              ]}
            />
          </div>

          <div className="flex items-center justify-end gap-1.5">
            {problems.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="destructive" className="mr-1 h-8 gap-1.5 px-2.5 text-xs">
                    <AlertTriangle /> {t('problems', { count: problems.length })}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[320px] whitespace-pre-line">
                  {problems.join('\n')}
                </TooltipContent>
              </Tooltip>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={problems.length > 0}
              onClick={() => {
                setTestEmail(userEmail)
                setTestOpen(true)
              }}
            >
              <Send /> {t('sendTest')}
            </Button>

            {saved && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title={t('deleteTemplate')}
                onClick={() => void remove()}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 /> {t('delete')}
              </Button>
            )}

            <Separator orientation="vertical" className="mx-1 h-5!" />

            <Button type="button" variant="outline" size="sm" disabled={!dirty} onClick={discard}>
              <RotateCcw /> {t('discard')}
            </Button>

            {saved && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || problems.length > 0}
                onClick={() => void save('copy')}
              >
                <Copy /> {t('saveAsNew')}
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              disabled={!canSave}
              onClick={() => void save(saved ? 'update' : 'first')}
            >
              <Save /> {saving ? t('saving') : dirty ? t('save') : t('savedState')}
            </Button>
          </div>
        </header>
      </TooltipProvider>

      <div className="relative flex min-h-0 flex-1">
        <EmailDesignerRail
          blocks={template.blocks}
          selected={selected}
          addable={addable}
          canRemove={template.blocks.length > 1}
          onSelect={setSelected}
          onToggle={toggleBlock}
          onMove={moveBlock}
          onAdd={addBlock}
          onRemove={removeBlock}
        />

        <EmailPreview
          from={sample.values.workshop_name ?? ''}
          subject={subject}
          previewLine={previewLine}
          html={html}
          text={text}
          width={width}
          view={view}
          selected={selected}
          onSelect={setSelected}
        />

        <EmailDesignerInspector
          kind={kind}
          subject={template.subject}
          theme={template.theme}
          selected={selectedBlock}
          problems={problems}
          canRemove={template.blocks.length > 1}
          onSubject={(value) => setTemplate((prev) => ({ ...prev, subject: value }))}
          onTheme={(patch) =>
            setTemplate((prev) => ({ ...prev, theme: { ...prev.theme, ...patch } }))
          }
          onBlock={patchBlock}
          onRemove={removeBlock}
        />
      </div>

      <Dialog open={naming !== null} onOpenChange={(open) => !open && setNaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('nameDialog.title')}</DialogTitle>
            <DialogDescription>{t('nameDialog.body')}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const mode = naming
              if (!mode || !name.trim()) return
              setNaming(null)
              void save(mode, name.trim())
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('nameDialog.placeholder')}
              maxLength={60}
              autoFocus
            />
            {nameTaken && (
              <p className="mt-2 text-xs text-muted-foreground">{t('nameDialog.nameExists')}</p>
            )}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setNaming(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                {nameTaken ? t('nameDialog.update') : t('nameDialog.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('testDialog.title')}</DialogTitle>
            <DialogDescription>{t('testDialog.body')}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!testEmail.trim()) return
              void sendTest()
            }}
          >
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder={t('testDialog.placeholder')}
              autoFocus
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setTestOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={sending || !testEmail.trim()}>
                {sending ? t('testDialog.sending') : t('testDialog.send')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Two or three icons that pick one thing, the way a design tool's top bar
 * does it: one pressed, a tooltip on each, the height of every other
 * control on the bar.
 */
function IconToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; icon: ReactNode }[]
}) {
  return (
    <div role="group" className="flex h-8 items-center gap-0.5 rounded-md bg-muted p-0.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={option.label}
                aria-pressed={active}
                onClick={() => onChange(option.value)}
                className={cn(
                  'flex h-7 w-8 items-center justify-center rounded-[5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4',
                  active
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {option.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{option.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

/** A saved row as a bare template, for comparing and editing. */
function stripSaved(row: SavedEmailTemplate): EmailTemplate {
  return {
    kind: row.kind,
    name: row.name,
    subject: row.subject,
    blocks: row.blocks,
    theme: row.theme,
  }
}
