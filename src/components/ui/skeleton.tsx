import { cn } from '@/lib/utils'

/** A placeholder while content loads; the wave itself is `.skeleton` in globals.css. */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('skeleton rounded-md', className)} {...props} />
}

export { Skeleton }
