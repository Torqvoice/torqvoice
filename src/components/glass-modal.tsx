'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { create } from 'zustand'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

type ModalType = 'error' | 'success' | 'info' | 'warning'

interface ModalState {
  isOpen: boolean
  type: ModalType
  title: string
  message: string
  open: (type: ModalType, title: string, message: string) => void
  close: () => void
}

export const useGlassModal = create<ModalState>((set) => ({
  isOpen: false,
  type: 'info',
  title: '',
  message: '',
  open: (type, title, message) => set({ isOpen: true, type, title, message }),
  close: () => set({ isOpen: false }),
}))

const icons: Record<ModalType, React.ReactNode> = {
  error: <XCircle className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
}

/**
 * The AppCard signature, recast per status: the same gradient icon chip with
 * an inset ring and top highlight, the same hairline fading out from under
 * the chip, and the same radial sheen that makes the header read as lit by
 * the chip — only in the status hue instead of primary. The modal is a
 * miniature of the cards the rest of the app is built from, which is what
 * makes it look like Torqvoice rather than a library default.
 */
const chip: Record<ModalType, string> = {
  error: 'from-red-500/12 to-red-500/4 text-red-600 ring-red-500/25 dark:text-red-400',
  success:
    'from-emerald-500/12 to-emerald-500/4 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400',
  info: 'from-blue-500/12 to-blue-500/4 text-blue-600 ring-blue-500/25 dark:text-blue-400',
  warning: 'from-amber-500/12 to-amber-500/4 text-amber-600 ring-amber-500/25 dark:text-amber-400',
}

const hairline: Record<ModalType, string> = {
  error: 'from-red-500/40',
  success: 'from-emerald-500/40',
  info: 'from-blue-500/40',
  warning: 'from-amber-500/40',
}

const sheen: Record<ModalType, string> = {
  error: 'bg-[radial-gradient(8rem_5rem_at_2.75rem_2.5rem,rgb(239_68_68/0.09),transparent_70%)]',
  success: 'bg-[radial-gradient(8rem_5rem_at_2.75rem_2.5rem,rgb(16_185_129/0.09),transparent_70%)]',
  info: 'bg-[radial-gradient(8rem_5rem_at_2.75rem_2.5rem,rgb(59_130_246/0.09),transparent_70%)]',
  warning: 'bg-[radial-gradient(8rem_5rem_at_2.75rem_2.5rem,rgb(245_158_11/0.09),transparent_70%)]',
}

export function GlassModal() {
  const t = useTranslations('common.shared')
  const { isOpen, type, title, message, close } = useGlassModal()

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="glass max-w-sm gap-0 overflow-hidden border-0 p-0 shadow-2xl sm:rounded-xl">
        <div className="relative">
          <div className={cn('pointer-events-none absolute inset-0', sheen[type])} />
          <div className="relative flex items-start gap-3 px-5 pb-4 pt-4">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-b ring-1 ring-inset shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]',
                chip[type]
              )}
            >
              {icons[type]}
            </div>
            <DialogHeader className="min-w-0 flex-1 gap-0.5 self-center pr-6 text-left sm:text-left">
              <DialogTitle className="text-sm font-semibold tracking-tight">{title}</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">{message}</DialogDescription>
            </DialogHeader>
          </div>
          {/* Signature hairline: status hue under the chip, gone by the far edge. */}
          <div className={cn('h-px bg-linear-to-r via-card-edge to-transparent', hairline[type])} />
        </div>
        <DialogFooter className="bg-muted/30 px-5 py-3">
          <Button size="sm" variant="outline" onClick={close} className="min-w-20">
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
