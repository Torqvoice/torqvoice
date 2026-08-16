'use client'

import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type ButtonProps = React.ComponentProps<typeof Button>

export interface IconActionButtonProps extends Omit<ButtonProps, 'children' | 'size'> {
  /** Translated action name. Used as the tooltip and the accessible name. */
  label: string
  icon: LucideIcon
  /** Shows a spinner in place of the icon and blocks the click. */
  loading?: boolean
  size?: 'icon-xs' | 'icon-sm' | 'icon' | 'icon-lg'
  /** Small overlay on the icon, e.g. a count of open observations. */
  badge?: React.ReactNode
}

/**
 * Icon-only action button with the label in a tooltip.
 *
 * Toolbars carry the same set of actions in twelve languages, and labels like
 * "Fra varelageret" or "Kundenbenachrichtigung" blow the row apart on a phone.
 * Dropping to the icon keeps every toolbar the same width in every language;
 * the label still reaches pointer users through the tooltip and screen reader
 * users through the accessible name.
 */
export function IconActionButton({
  label,
  icon: Icon,
  loading = false,
  size = 'icon-sm',
  variant = 'outline',
  className,
  disabled,
  badge,
  ...props
}: IconActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          aria-label={label}
          variant={variant}
          size={size}
          disabled={disabled || loading}
          className={cn('relative', className)}
          {...props}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
          {badge}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
