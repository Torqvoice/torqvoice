'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PresenceUser, RecordKind } from '@/lib/realtime/events'
import { useRecordPresence } from '../hooks'

/**
 * Who else has this record open.
 *
 * The point is not decoration: two people on one work order used to find out
 * by saving over each other. A chip says "Marco is in here too" before
 * anybody types, which is the cheapest possible way to prevent it.
 *
 * Only other people are shown. Your own chip would be a permanent fixture
 * that says nothing, and the space on a work order header is worth more than
 * that.
 */

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** At most this many faces; the rest become "+3". */
const SHOWN = 3

export function PresenceChips({
  kind,
  id,
  className,
}: {
  kind: RecordKind
  id: string
  className?: string
}) {
  const t = useTranslations('realtime')
  const { others } = useRecordPresence(kind, id)
  if (others.length === 0) return null

  const shown = others.slice(0, SHOWN)
  const hidden = others.length - shown.length

  return (
    <div
      data-testid="presence-chips"
      className={cn('flex items-center -space-x-1.5', className)}
      aria-label={t('alsoHere', { count: others.length })}
    >
      {shown.map((user) => (
        <Chip key={user.userId} user={user} label={t('alsoHereName', { name: user.name })} />
      ))}
      {hidden > 0 && (
        <span className="z-10 flex h-6 min-w-6 items-center justify-center rounded-full border border-background bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
          +{hidden}
        </span>
      )}
    </div>
  )
}

function Chip({ user, label }: { user: PresenceUser; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="presence-chip"
          data-user={user.userId}
          style={{ backgroundColor: user.color }}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-background text-[10px] font-semibold text-white shadow-sm"
        >
          {initialsOf(user.name)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
