'use client'

import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { EmailTheme } from '../Lib/emailTemplate'
import {
  RICH_FONT_SIZES,
  type RichAlign,
  type RichDoc,
  type RichMark,
  type RichNode,
} from '../Lib/richText'
import { normalizeHref } from '../Lib/links'
import { HEX_COLOR } from './EmailDesignerControls'
import type { TagTargets } from './TagPicker'

/**
 * The link strings quote a tag as an example. next-intl would read the
 * braces as an argument, so the tag is handed in as its own text.
 */
const TAG_EXAMPLE = { share_link: '{share_link}' }

type RichFontSize = (typeof RICH_FONT_SIZES)[number]

const FONT_SIZE_KEYS: Record<RichFontSize, string> = {
  '13px': 'small',
  '15px': 'normal',
  '18px': 'large',
  '22px': 'extraLarge',
}

const ALIGNS: RichAlign[] = ['left', 'center', 'right']

/** The size picker's word for "whatever the block's style says"; an item cannot be the empty string. */
const DEFAULT_SIZE = 'default'

/** A tag on its own, which the link field accepts as a destination. */
const TAG_HREF = /^\{[a-z_]+\}$/

/**
 * Colour and size on a run of text, as one mark named the way the engine
 * names it. The stock text-style and colour extensions are not installed,
 * and this is all they would add: two attributes on a span.
 */
const TextStyle = Mark.create({
  name: 'textStyle',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (attrs) => (attrs.color ? { style: `color: ${attrs.color}` } : {}),
      },
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span', getAttrs: (element) => (element.hasAttribute('style') ? {} : false) }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

/** Alignment as an attribute on the paragraph, which is where the engine reads it. */
const TextAlign = Extension.create({
  name: 'emailTextAlign',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => element.style.textAlign || null,
            renderHTML: (attrs) =>
              attrs.textAlign ? { style: `text-align: ${attrs.textAlign}` } : {},
          },
        },
      },
    ]
  },
})

const isFontSize = (value: unknown): value is RichFontSize =>
  typeof value === 'string' && (RICH_FONT_SIZES as readonly string[]).includes(value)

/**
 * The editor's document as the engine's shape and nothing more: no null
 * attributes, no list numbering, no link target. What is saved is what the
 * schema names, and a block opened and left alone stays byte-for-byte the
 * same.
 */
export function toRichDoc(json: Record<string, unknown>): RichDoc {
  const content = Array.isArray(json.content) ? json.content : []
  return { type: 'doc', content: content.map(toNode).filter((n): n is RichNode => n !== null) }
}

function toNode(raw: unknown): RichNode | null {
  if (!raw || typeof raw !== 'object') return null
  const node = raw as {
    type?: string
    text?: string
    attrs?: Record<string, unknown>
    marks?: unknown[]
    content?: unknown[]
  }
  const children = () =>
    (Array.isArray(node.content) ? node.content : [])
      .map(toNode)
      .filter((n): n is RichNode => n !== null)

  switch (node.type) {
    case 'text': {
      const marks = (node.marks ?? []).map(toMark).filter((m): m is RichMark => m !== null)
      const text: RichNode = { type: 'text', text: node.text ?? '' }
      return marks.length ? { ...text, marks } : text
    }
    case 'hardBreak':
      return { type: 'hardBreak' }
    case 'paragraph': {
      const align = node.attrs?.textAlign
      const paragraph: RichNode = { type: 'paragraph', content: children() }
      return align === 'center' || align === 'right'
        ? { ...paragraph, attrs: { textAlign: align } }
        : paragraph
    }
    case 'bulletList':
    case 'orderedList':
    case 'listItem':
      return { type: node.type, content: children() }
    default:
      return null
  }
}

function toMark(raw: unknown): RichMark | null {
  if (!raw || typeof raw !== 'object') return null
  const mark = raw as { type?: string; attrs?: Record<string, unknown> }
  switch (mark.type) {
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strike':
      return { type: mark.type }
    case 'link': {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : ''
      return href ? { type: 'link', attrs: { href } } : null
    }
    case 'textStyle': {
      const attrs: { color?: string; fontSize?: RichFontSize } = {}
      const color = mark.attrs?.color
      if (typeof color === 'string' && HEX_COLOR.test(color)) attrs.color = color
      if (isFontSize(mark.attrs?.fontSize)) attrs.fontSize = mark.attrs.fontSize
      return Object.keys(attrs).length ? { type: 'textStyle', attrs } : null
    }
    default:
      return null
  }
}

/**
 * The words of a text block with their formatting.
 *
 * Tiptap, kept to the vocabulary the renderers know: paragraphs, lists,
 * the inline marks, alignment on a paragraph. Everything else in the
 * starter kit is switched off, so nothing can be typed that a mail client
 * would not draw. Tags stay plain text inside the document; the picker
 * writes them at the cursor like any other characters.
 */
export function EmailRichEditor({
  id,
  label,
  value,
  theme,
  targets,
  onChange,
}: {
  id: string
  label: string
  /** The document as opened; later changes are the editor's own. */
  value: RichDoc
  theme: EmailTheme
  targets: TagTargets
  onChange: (doc: RichDoc) => void
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        link: false,
        underline: false,
        // A list at the end of the block must not grow a blank paragraph
        // after it, which the mail would print as an empty line.
        trailingNode: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        isAllowedUri: (url, ctx) => TAG_HREF.test(url) || ctx.defaultValidate(url),
      }),
      TextStyle,
      TextAlign,
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(toRichDoc(editor.getJSON())),
    onFocus: () => targets.setFocused(id),
    editorProps: {
      attributes: {
        'aria-label': label,
        class:
          'tiptap-content email-rich-editor min-h-[140px] max-h-[48vh] overflow-y-auto px-2.5 py-2 text-[13px] leading-relaxed text-foreground outline-none [&_a]:text-primary [&_a]:underline',
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    targets.register(id, { kind: 'editor', editor })
    return () => targets.register(id, null)
  }, [editor, id, targets])

  return (
    <div>
      <div className="mb-1 block text-[13px] font-medium text-foreground">{label}</div>
      <div className="rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        {editor && <Toolbar editor={editor} theme={theme} />}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function Toolbar({ editor, theme }: { editor: Editor; theme: EmailTheme }) {
  const t = useTranslations('settings.emailTemplates.toolbar')
  // The editor does not re-render React on every transaction; the toolbar
  // asks for the bits of state it paints and re-renders when those change.
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      link: editor.isActive('link'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      align: (editor.getAttributes('paragraph').textAlign as RichAlign | null) ?? 'left',
      color: (editor.getAttributes('textStyle').color as string | null) ?? null,
      fontSize: (editor.getAttributes('textStyle').fontSize as string | null) ?? null,
      href: (editor.getAttributes('link').href as string | null) ?? '',
    }),
  })

  const setStyle = (patch: { color?: string | null; fontSize?: string | null }) => {
    const current = editor.getAttributes('textStyle')
    const next = { color: current.color ?? null, fontSize: current.fontSize ?? null, ...patch }
    const chain = editor.chain().focus()
    if (!next.color && !next.fontSize) chain.unsetMark('textStyle').run()
    else chain.setMark('textStyle', next).run()
  }

  const align = (value: RichAlign) =>
    editor
      .chain()
      .focus()
      .updateAttributes('paragraph', { textAlign: value === 'left' ? null : value })
      .run()

  const clear = () =>
    editor.chain().focus().unsetAllMarks().updateAttributes('paragraph', { textAlign: null }).run()

  const alignIcons = { left: AlignLeft, center: AlignCenter, right: AlignRight }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        <ToolButton
          label={t('bold')}
          active={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} />
        </ToolButton>
        <ToolButton
          label={t('italic')}
          active={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </ToolButton>
        <ToolButton
          label={t('underline')}
          active={state.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={14} />
        </ToolButton>
        <ToolButton
          label={t('strike')}
          active={state.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={14} />
        </ToolButton>
        <LinkButton editor={editor} active={state.link} href={state.href} />

        <Divider />

        <ToolButton
          label={t('bulletList')}
          active={state.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </ToolButton>
        <ToolButton
          label={t('orderedList')}
          active={state.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} />
        </ToolButton>

        <Divider />

        {ALIGNS.map((value) => {
          const Icon = alignIcons[value]
          return (
            <ToolButton
              key={value}
              label={t(`align.${value}`)}
              active={state.align === value}
              onClick={() => align(value)}
            >
              <Icon size={14} />
            </ToolButton>
          )
        })}

        <Divider />

        <Select
          value={isFontSize(state.fontSize) ? state.fontSize : DEFAULT_SIZE}
          onValueChange={(value) => setStyle({ fontSize: value === DEFAULT_SIZE ? null : value })}
        >
          <SelectTrigger
            size="sm"
            aria-label={t('size.label')}
            title={t('size.label')}
            className="h-7 border-transparent bg-transparent px-1.5 text-xs shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            // Picking a size is a command on the selection; the editor gets
            // focus back, not the trigger.
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              editor.commands.focus()
            }}
          >
            <SelectItem value={DEFAULT_SIZE}>{t('size.default')}</SelectItem>
            {RICH_FONT_SIZES.map((size) => (
              <SelectItem key={size} value={size}>
                {t(`size.${FONT_SIZE_KEYS[size]}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ColorButton theme={theme} color={state.color} onChange={(color) => setStyle({ color })} />

        <Divider />

        <ToolButton label={t('clear')} active={false} onClick={clear}>
          <RemoveFormatting size={14} />
        </ToolButton>
      </div>
    </TooltipProvider>
  )
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-border" />
}

/** The look of a toolbar button, pressed or not; the app's own editor uses the same. */
const toolButtonClass = (active: boolean) =>
  cn(
    'flex h-7 w-7 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
    active
      ? 'bg-primary/15 text-primary'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  )

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          // Mouse down would take focus from the editor and drop the
          // selection the command is meant for; the click still fires.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={toolButtonClass(active)}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A link on the selected words. The destination may be a tag such as
 * {share_link}, which is what most links in a workshop mail are.
 */
function LinkButton({ editor, active, href }: { editor: Editor; active: boolean; href: string }) {
  const t = useTranslations('settings.emailTemplates.toolbar')
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const apply = () => {
    const url = normalizeHref(draft)
    const chain = editor.chain().focus().extendMarkRange('link')
    if (url) chain.setLink({ href: url }).run()
    else chain.unsetLink().run()
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(href)
        setOpen(next)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('link')}
              aria-pressed={active}
              onMouseDown={(e) => e.preventDefault()}
              className={toolButtonClass(active)}
            >
              <Link2 size={14} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t('link')}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-72 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
          className="space-y-2"
        >
          <label htmlFor={inputId} className="block text-xs font-medium text-foreground">
            {t('linkUrl')}
          </label>
          <Input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('linkPlaceholder', TAG_EXAMPLE)}
            maxLength={500}
            spellCheck={false}
            autoFocus
            className="h-8 font-mono text-xs md:text-xs"
          />
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            {t('linkHint', TAG_EXAMPLE)}
          </p>
          <div className="flex justify-end gap-1.5 pt-1">
            {active && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  setDraft('')
                  editor.chain().focus().extendMarkRange('link').unsetLink().run()
                  setOpen(false)
                }}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {t('linkRemove')}
              </Button>
            )}
            <Button type="submit" size="xs">
              {t('linkApply')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The colour of the selected words: the theme's own three first, since a
 * mail that uses more than those rarely looks like it came from a business,
 * then a hex field for the odd exception.
 */
function ColorButton({
  theme,
  color,
  onChange,
}: {
  theme: EmailTheme
  color: string | null
  onChange: (color: string | null) => void
}) {
  const t = useTranslations('settings.emailTemplates.toolbar')
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState('')
  const swatches = [
    { value: theme.textColor, label: t('color.text') },
    { value: theme.mutedColor, label: t('color.muted') },
    { value: theme.primaryColor, label: t('color.primary') },
  ]
  const hexValid = HEX_COLOR.test(hex)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setHex(color ?? '')
        setOpen(next)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('color.label')}
              onMouseDown={(e) => e.preventDefault()}
              className={cn(toolButtonClass(false), 'relative')}
            >
              <Baseline size={14} />
              <span
                className="absolute bottom-[3px] left-[7px] h-[3px] w-[14px] rounded-sm"
                style={{ background: color ?? theme.textColor }}
              />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t('color.label')}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-60 p-3">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            {swatches.map((swatch) => (
              <button
                key={swatch.label}
                type="button"
                title={swatch.label}
                aria-label={swatch.label}
                onClick={() => {
                  onChange(swatch.value)
                  setOpen(false)
                }}
                className={cn(
                  'h-7 w-7 rounded-full border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  color === swatch.value ? 'border-primary' : 'border-border'
                )}
                // The swatch is the theme's colour itself, not chrome.
                style={{ background: swatch.value }}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="ml-auto"
            >
              {t('color.default')}
            </Button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!hexValid) return
              onChange(hex.toLowerCase())
              setOpen(false)
            }}
            className="flex items-center gap-1.5"
          >
            <Input
              value={hex}
              onChange={(e) => setHex(e.target.value.trim())}
              placeholder="#000000"
              maxLength={7}
              spellCheck={false}
              aria-label={t('color.hex')}
              aria-invalid={Boolean(hex) && !hexValid}
              className="h-7 px-2 font-mono text-xs md:text-xs"
            />
            <Button type="submit" size="xs" disabled={!hexValid}>
              {t('color.apply')}
            </Button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  )
}
