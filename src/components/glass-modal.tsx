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
  error: <XCircle className="h-5 w-5" />,
  success: <CheckCircle2 className="h-5 w-5" />,
  info: <Info className="h-5 w-5" />,
  warning: <AlertTriangle className="h-5 w-5" />,
}

/**
 * Soft tinted badge behind the icon. An inner ring of the same hue reads as a
 * focus halo and does the "this is a status, not a button" work that a bare
 * icon next to the title never quite managed.
 */
const badges: Record<ModalType, string> = {
  error: 'bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400',
  success: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400',
  info: 'bg-blue-500/10 text-blue-600 ring-blue-500/20 dark:text-blue-400',
  warning: 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400',
}

export function GlassModal() {
  const t = useTranslations('common.shared')
  const { isOpen, type, title, message, close } = useGlassModal()

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="glass max-w-sm gap-4 border-0 p-5 shadow-2xl sm:rounded-xl">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4',
              badges[type]
            )}
          >
            {icons[type]}
          </div>
          <DialogHeader className="min-w-0 gap-1 text-left sm:text-left">
            <DialogTitle className="text-base leading-9">{title}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">{message}</DialogDescription>
          </DialogHeader>
        </div>
        <DialogFooter>
          <Button size="sm" onClick={close} className="min-w-20">
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
