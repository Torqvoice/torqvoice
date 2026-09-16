'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Palette } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/components/confirm-dialog'
import {
  getIssuedDesignState,
  reapplyDesignToInvoice,
} from '@/features/invoices/Actions/invoiceDesignActions'

interface DesignState {
  issuedAt: string
  followsDefault: boolean
  matchedDesignId: string | null
  unknown: boolean
  designs: { id: string; name: string }[]
}

interface InvoiceDesignMenuProps {
  recordId: string
  /** What "the current default" resolves to for this invoice, if it has a name. */
  designFollowsName: string | null
}

/**
 * Changing the look of an invoice that has already gone to the customer.
 *
 * A bare "use the current design" told nobody anything, so this is a submenu
 * that says what state the invoice is in before it offers to change it: when
 * it was sent, that it still prints with the design it was sent with, and
 * that picking another changes the look and nothing the invoice says.
 *
 * Which design is in force is not stored anywhere, so it is worked out by
 * hashing on the server when the submenu opens rather than on every page
 * load. Until that lands the list is not shown at all: a list with no tick on
 * it would be a worse answer than a spinner.
 */
export function InvoiceDesignMenu({ recordId, designFollowsName }: InvoiceDesignMenuProps) {
  const t = useTranslations('service.header')
  const router = useRouter()
  const confirm = useConfirm()
  const [state, setState] = useState<DesignState | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const result = await getIssuedDesignState(recordId)
    if (result.success && result.data) setState(result.data as DesignState)
  }

  const pick = async (designId: string | null, name: string) => {
    const ok = await confirm({
      title: t('designPickConfirmTitle', { name }),
      description: t('designPickConfirmBody'),
      confirmLabel: t('designPickConfirm'),
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    const result = await reapplyDesignToInvoice(recordId, designId)
    setBusy(false)
    if (!result.success) {
      toast.error(t('designPickFailed'))
      return
    }
    // The tick has moved; the next open re-reads where to.
    setState(null)
    toast.success(t('designPickDone', { name }))
    router.refresh()
  }

  // The row says what following the default means here; the confirm and the
  // toast name the design itself, because "now prints with Follow the current
  // default (Nordic Blue)" is not a sentence.
  const defaultLabel = designFollowsName
    ? t('designFollowNamed', { name: designFollowsName })
    : t('designFollow')
  const defaultName = designFollowsName ?? t('designDefaultName')

  return (
    <DropdownMenuSub
      onOpenChange={(open) => {
        if (open && !state) void load()
      }}
    >
      <DropdownMenuSubTrigger>
        <Palette className="mr-2 size-4" aria-hidden="true" />
        {t('designMenu')}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="max-w-[min(20rem,calc(100vw-2rem))]">
          <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground whitespace-normal">
            {state
              ? t('designMenuExplain', {
                  date: new Date(state.issuedAt).toLocaleDateString(),
                })
              : t('designMenuLoading')}
          </p>
          {state && (
            <>
              <DropdownMenuSeparator />
              {state.unknown && <Choice label={t('designSentWith')} current />}
              <Choice
                label={defaultLabel}
                current={state.followsDefault}
                onPick={busy ? undefined : () => void pick(null, defaultName)}
              />
              {state.designs.map((design) => (
                <Choice
                  key={design.id}
                  label={design.name}
                  current={state.matchedDesignId === design.id}
                  onPick={busy ? undefined : () => void pick(design.id, design.name)}
                />
              ))}
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

/**
 * One design to choose from. The one in force is ticked and cannot be picked,
 * so the menu answers "which is it?" and "what else?" in the same list; the
 * others keep the tick's width so the names line up.
 */
function Choice({
  label,
  current,
  onPick,
}: {
  label: string
  current: boolean
  onPick?: () => void
}) {
  return (
    <DropdownMenuItem disabled={current || !onPick} onClick={onPick}>
      {current ? (
        <Check className="size-4 shrink-0" aria-hidden="true" />
      ) : (
        <span className="size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{label}</span>
    </DropdownMenuItem>
  )
}
