'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'
import {
  EDITOR_LINK_OPTIONS,
  openLinkOnModifierClick,
  useLinkHint,
} from '@/components/ui/rich-text-links'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  /** Extra classes for the writing area, such as a taller minimum height. */
  contentClassName?: string
}

function ToolbarButton({
  onClick,
  isActive,
  label,
  children,
}: {
  onClick: () => void
  isActive: boolean
  /** What the icon means, for a screen reader and as the hover hint. */
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors',
        isActive
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  contentClassName,
}: RichTextEditorProps) {
  const t = useTranslations('common.richText')
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        bulletList: { HTMLAttributes: { class: 'list-disc pl-4' } },
        orderedList: { HTMLAttributes: { class: 'list-decimal pl-4' } },
        // The same link behaviour as every other editor; see rich-text-links.
        link: EDITOR_LINK_OPTIONS,
      }),
      Placeholder.configure({ placeholder: placeholder ?? t('placeholder') }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      handleClick: openLinkOnModifierClick,
      attributes: {
        // The writing area is a bare contenteditable; without these a screen
        // reader announces it as nothing in particular.
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': placeholder ?? t('editor'),
        class: cn(
          'tiptap-content min-h-[120px] max-h-[40vh] overflow-y-auto overflow-x-hidden px-3 py-2 text-sm outline-none break-all',
          contentClassName
        ),
      },
    },
  })

  const linkHint = useLinkHint(true)

  // Sync external content changes (e.g. when switching between create/edit)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      // Putting the saved text in is not an edit, and must not be reported as one.
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  if (!editor) return null

  return (
    <div className="rounded-md border border-input shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring-soft">
      {/* Toolbar */}
      <div
        role="toolbar"
        aria-label={t('toolbar')}
        className="flex items-center gap-0.5 border-b px-2 py-1"
      >
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          label={t('bold')}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          label={t('italic')}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          label={t('underline')}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          label={t('strikethrough')}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          label={t('bulletList')}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          label={t('numberedList')}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {/* Editor */}
      <div {...linkHint.handlers}>
        <EditorContent editor={editor} />
      </div>
      {linkHint.hint}
    </div>
  )
}
