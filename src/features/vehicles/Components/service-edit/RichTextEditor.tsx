'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Button } from '@/components/ui/button'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Undo,
  Redo,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  EDITOR_LINK_OPTIONS,
  openLinkOnModifierClick,
  useLinkHint,
} from '@/components/ui/rich-text-links'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  /**
   * False on a locked document. A disabled fieldset turns off inputs and
   * buttons but not a contenteditable, so without this the text could still
   * be typed into and was then quietly never saved.
   */
  editable?: boolean
  /**
   * `boxed` (the default) draws the editor as a field of its own, for a form
   * with other fields beside it. `flush` is for a card that holds nothing
   * but the editor: no border, no fill and no rounding, the toolbar a strip
   * under the card's header and the text on the card's own margins, so the
   * card is the field rather than a frame around one.
   */
  variant?: 'boxed' | 'flush'
  /**
   * For a flush editor: how far in the text starts, to match the container
   * it fills. `card` is the house card's margin, `panel` the tighter one of
   * the plain bordered panels on the quote page and the classic work order.
   */
  gutter?: 'card' | 'panel'
}

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  editable = true,
  variant = 'boxed',
  gutter = 'card',
}: RichTextEditorProps) {
  const flush = variant === 'flush'
  const linkHint = useLinkHint(editable)
  const lastContentRef = useRef(content)

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      // Link and underline come bundled with StarterKit from v3, so they are
      // configured through it rather than added again. Registering them
      // twice leaves two extensions answering to the same name, which tiptap
      // warns about and which makes the toolbar's active state unreliable.
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: EDITOR_LINK_OPTIONS,
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Write something...',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      // Only what somebody typed is a change. The work order autosaves five
      // seconds after one, so an update reported for anything else is a save
      // nobody asked for.
      if (html === lastContentRef.current) return
      lastContentRef.current = html
      onChange(html)
    },
    editorProps: {
      // Ctrl or Cmd with a click opens a link; see rich-text-links.
      handleClick: openLinkOnModifierClick,
      attributes: {
        class: cn(
          'tiptap-content text-sm outline-none h-full',
          // In a card the text starts where the card's title does.
          flush && gutter === 'card' ? 'px-5 py-3' : 'px-3 py-2'
        ),
      },
    },
  })

  // Quietly: tiptap reports an update from `setEditable` and `setContent`
  // unless told not to. Left to its default, mounting this editor marked the
  // work order as edited, and every page that was merely opened saved itself
  // five seconds later. With two people on one job each of those saves woke
  // the other's page, which mounted, which saved: requests without end, and
  // the job's lines rewritten each time.
  useEffect(() => {
    editor?.setEditable(editable, false)
  }, [editor, editable])

  // Sync editor when content is updated externally (e.g. AI generation)
  useEffect(() => {
    if (editor && content !== lastContentRef.current) {
      lastContentRef.current = content
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  if (!editor) return null

  const handleSetLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', previous ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    const normalized =
      /^https?:\/\//i.test(url) || url.startsWith('mailto:') ? url : `https://${url}`
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run()
  }

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden resize-y',
        flush
          ? // The card is the field: nothing drawn around the editor, and a
            // locked one is told apart by its muted text alone.
            !editable && 'text-muted-foreground'
          : cn(
              'rounded-md border border-input',
              editable ? 'bg-background' : 'bg-muted/40 text-muted-foreground'
            )
      )}
      style={{ minHeight: 180 }}
    >
      {editable && (
        <div
          className={cn(
            'flex shrink-0 flex-wrap items-center gap-0.5 border-b py-1',
            // Lined up with the card's title; the first button's own inset
            // makes up the rest of the margin.
            flush
              ? cn('border-border/70', gutter === 'card' ? 'px-3.5' : 'px-1.5')
              : 'bg-muted/30 px-1'
          )}
        >
          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('link')} onClick={handleSetLink} title="Link">
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarButton>

          <div className="mx-0.5 h-4 w-px bg-border" />

          <ToolbarButton
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Subheading"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </ToolbarButton>

          <div className="mx-0.5 h-4 w-px bg-border" />

          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered List"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Quote"
          >
            <Quote className="h-3.5 w-3.5" />
          </ToolbarButton>

          <div className="mx-0.5 h-4 w-px bg-border" />

          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <Redo className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
      )}
      {/* The text itself is only as tall as what is written, and the box is
          taller, so a click in the empty space below it would land nowhere.
          Anywhere in the box puts the cursor at the end, as a textarea does. */}
      <div
        data-testid="rich-text-area"
        className={cn('flex-1 overflow-y-auto', editable && 'cursor-text')}
        {...linkHint.handlers}
        onMouseDown={(e) => {
          if (!editable) return
          if ((e.target as HTMLElement).closest('.ProseMirror')) return
          e.preventDefault()
          editor.commands.focus('end')
        }}
      >
        <EditorContent editor={editor} className="h-full [&>.tiptap]:h-full" />
      </div>
      {linkHint.hint}
    </div>
  )
}

function ToolbarButton({
  children,
  active,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        'h-7 w-7',
        active && 'bg-accent text-accent-foreground',
        disabled && 'opacity-40'
      )}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </Button>
  )
}
