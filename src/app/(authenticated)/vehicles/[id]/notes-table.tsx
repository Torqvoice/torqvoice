'use client'

import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { interactiveRow } from '@/lib/interactive-row'
import { useFormatDate } from '@/lib/use-format-date'
import { Button } from '@/components/ui/button'
import { useInfiniteRows } from '@/components/infinite-list/use-infinite-rows'
import {
  InfiniteListCount,
  InfiniteListFooter,
  InfiniteTableFooter,
} from '@/components/infinite-list/infinite-list-footer'
import { getNoteRows } from '@/features/vehicles/Actions/getNoteRows'
import type { Cursor } from '@/lib/keyset'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { MoreVertical, Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export interface NoteRow {
  id: string
  title: string
  content: string
  isPinned: boolean
  createdAt: Date
}

/** One batch of the list; the first also carries the total. */
export interface NoteBatch {
  rows: NoteRow[]
  nextCursor: Cursor | null
  total?: number
}

interface NotesTableProps {
  vehicleId: string
  /** The first batch, rendered on the server; the rest load as the list scrolls. */
  initial: NoteBatch
  /**
   * Where the sticky header stops: under the page header while the window
   * scrolls, at the top of the box when the list sits in one.
   */
  stickyHeaderClassName?: string
  onSelectNote: (note: NoteRow) => void
  /** Leave out where the page has its own button for adding a note. */
  onAddNote?: () => void
  onTogglePin: (id: string) => void
  onDeleteNote: (id: string) => void
}

export function NotesTable({
  vehicleId,
  initial,
  stickyHeaderClassName = 'top-16',
  onSelectNote,
  onAddNote,
  onTogglePin,
  onDeleteNote,
}: NotesTableProps) {
  const { formatDate } = useFormatDate()
  const tableNav = useTableKeyboardNav()
  const t = useTranslations('vehicles.notes')

  const list = useInfiniteRows<NoteRow, Cursor, NoteBatch>({
    queryKey: ['vehicle-notes', vehicleId],
    initial,
    fetchPage: (cursor) => getNoteRows({ vehicleId, cursor }),
  })
  const records = list.rows

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {(onAddNote || list.total > 0) && (
        <div className="flex items-center justify-between">
          <InfiniteListCount shown={records.length} total={list.total} />
          {onAddNote && (
            <div className="ml-auto">
              <Button
                size="sm"
                onClick={onAddNote}
                aria-label={t('addNote')}
                title={t('addNote')}
                className="h-9 w-9 p-0 md:h-8 md:w-auto md:px-3"
              >
                <Plus className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
                <span className="hidden md:inline">{t('addNote')}</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Card list (phones + small tablets) */}
      <div className="space-y-2 md:hidden">
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        ) : (
          records.map((n) => (
            <div key={n.id} className="flex items-start gap-2 rounded-lg border bg-card p-3">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onSelectNote(n)}
              >
                <div className="flex items-center gap-1.5">
                  {n.isPinned && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  <span className="truncate font-medium">{n.title}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {n.content.replace(/<[^>]*>/g, '')}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {formatDate(new Date(n.createdAt))}
                </p>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-1 h-9 w-9 shrink-0"
                    aria-label={t('openMenu')}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onTogglePin(n.id)}>
                    {n.isPinned ? (
                      <PinOff className="mr-2 h-4 w-4" />
                    ) : (
                      <Pin className="mr-2 h-4 w-4" />
                    )}
                    {n.isPinned ? t('unpin') : t('pin')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => onDeleteNote(n.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
        {records.length > 0 && <InfiniteListFooter state={list} />}
      </div>

      {/* Table (md and up). The rows scroll with the page (or the box the page
          puts the list in), so the table's own box must not clip them. */}
      <div className="hidden rounded-lg border md:block" {...tableNav.containerProps}>
        <Table containerClassName="overflow-visible">
          <TableHeader sticky className={stickyHeaderClassName}>
            <TableRow>
              <TableHead className="w-7.5"></TableHead>
              <TableHead className="w-40">{t('table.title')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('table.content')}</TableHead>
              <TableHead className="w-30">{t('table.date')}</TableHead>
              <TableHead className="w-12.5"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              records.map((n) => (
                <ContextMenu key={n.id} modal={false}>
                  <ContextMenuTrigger asChild>
                    <TableRow className="cursor-pointer" {...interactiveRow(() => onSelectNote(n))}>
                      <TableCell className="w-[30px] px-2">
                        {n.isPinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                      </TableCell>
                      <TableCell className="font-medium">{n.title}</TableCell>
                      <TableCell className="hidden max-w-0 sm:table-cell">
                        <p className="truncate text-sm text-muted-foreground">
                          {n.content.replace(/<[^>]*>/g, '')}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatDate(new Date(n.createdAt))}
                      </TableCell>
                      <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={t('openMenu')}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onTogglePin(n.id)}>
                              {n.isPinned ? (
                                <PinOff className="mr-2 h-4 w-4" />
                              ) : (
                                <Pin className="mr-2 h-4 w-4" />
                              )}
                              {n.isPinned ? t('unpin') : t('pin')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => onDeleteNote(n.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-52">
                    <ContextMenuItem onClick={() => onTogglePin(n.id)}>
                      {n.isPinned ? (
                        <PinOff className="mr-2 h-4 w-4" />
                      ) : (
                        <Pin className="mr-2 h-4 w-4" />
                      )}
                      {n.isPinned ? t('unpin') : t('pin')}
                    </ContextMenuItem>
                    <ContextMenuItem variant="destructive" onClick={() => onDeleteNote(n.id)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('delete')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))
            )}
            {records.length > 0 && <InfiniteTableFooter state={list} colSpan={5} />}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
