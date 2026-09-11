'use client'

import Link from 'next/link'
import { create } from 'zustand'
import { useTranslations } from 'next-intl'
import { Zap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { GatedFeature } from '@/lib/with-auth'

interface GateState {
  isOpen: boolean
  gate: GatedFeature | null
  open: (gate: GatedFeature) => void
  close: () => void
}

export const useUpgradeGate = create<GateState>((set) => ({
  isOpen: false,
  gate: null,
  open: (gate) => set({ isOpen: true, gate }),
  close: () => set({ isOpen: false }),
}))

/**
 * Show the upgrade dialog when an action was refused by the plan.
 *
 * Returns true when it did, so the caller skips its own error path:
 *
 *   if (!handleGated(result)) toast.error(result.error)
 *
 * A plan limit used to arrive as a red error box saying "limit reached",
 * in English, with nowhere to go. It is not an error. It is the moment the
 * product asks to be paid for, and it should look like one.
 */
export function handleGated(
  result: { success?: boolean; error?: string; gated?: GatedFeature } | null | undefined
): boolean {
  if (!result?.gated) return false
  useUpgradeGate.getState().open(result.gated)
  return true
}

/** Mounted once, next to the glass modal; opened through `handleGated`. */
export function UpgradeGateDialog() {
  const t = useTranslations('common.upgrade')
  const ts = useTranslations('common.shared')
  const { isOpen, gate, close } = useUpgradeGate()

  const description =
    gate?.feature === 'maxCustomers' && gate.limit != null
      ? t('maxCustomers', { limit: gate.limit })
      : gate?.feature === 'maxUsers' && gate.limit != null
        ? t('maxUsers', { limit: gate.limit })
        : t('generic')

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="glass max-w-sm gap-0 overflow-hidden border-0 p-0 shadow-2xl sm:rounded-xl">
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(8rem_5rem_at_2.75rem_2.5rem,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_70%)]" />
          <div className="relative flex items-start gap-3 px-5 pb-4 pt-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-b from-primary/15 to-primary/5 text-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] ring-1 ring-primary/25 ring-inset">
              <Zap className="h-4 w-4" />
            </div>
            <DialogHeader className="min-w-0 flex-1 gap-0.5 self-center pr-6 text-left sm:text-left">
              <DialogTitle className="text-sm font-semibold tracking-tight">
                {t('title')}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                {description}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="h-px bg-linear-to-r from-primary/40 via-card-edge to-transparent" />
        </div>
        <DialogFooter className="bg-muted/30 px-5 py-3 sm:justify-between">
          <Button size="sm" variant="outline" onClick={close}>
            {t('notNow')}
          </Button>
          <Button size="sm" asChild onClick={close}>
            <Link href="/settings/subscription">{ts('viewPlans')}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
