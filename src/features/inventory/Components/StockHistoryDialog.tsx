'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { getStockMovements } from '../Actions/getStockMovements'

interface Movement {
  id: string
  delta: number
  quantityAfter: number
  reason: string
  note: string | null
  createdAt: string
  userName: string | null
  serviceRecordId: string | null
  vehicleId: string | null
  label: string | null
  vehicle: string | null
}

/**
 * Audit trail for one part: what moved, when, why, and — crucially — which job
 * consumed it, linked through so you can jump straight to the work order.
 */
export function StockHistoryDialog({
  partId,
  partName,
  open,
  onOpenChange,
}: {
  partId: string | null
  partName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('inventory')
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !partId) return
    let cancelled = false
    setLoading(true)
    getStockMovements(partId)
      .then((res) => {
        if (cancelled) return
        setMovements(res.success && res.data ? res.data : [])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, partId])

  // `reason` is stored as free text, so a row written by a newer version could
  // carry a value this build has no translation for. Mapping explicitly over
  // the known set keeps `t()` off dynamic keys (which throws when missing) and
  // falls back to the raw value instead of blowing up the dialog.
  const reasonLabel = (reason: string) => {
    switch (reason) {
      case 'service_record':
        return t('history.reasons.service_record')
      case 'service_record_deleted':
        return t('history.reasons.service_record_deleted')
      case 'quote_conversion':
        return t('history.reasons.quote_conversion')
      case 'manual_adjustment':
        return t('history.reasons.manual_adjustment')
      case 'bulk_markup':
        return t('history.reasons.bulk_markup')
      default:
        return reason
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('history.title')}</DialogTitle>
          <DialogDescription>
            {t('history.description', { name: partName })}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : movements.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t('history.empty')}
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">{t('history.when')}</th>
                  <th className="py-2 pr-2 font-medium">{t('history.change')}</th>
                  <th className="py-2 pr-2 font-medium">{t('history.balance')}</th>
                  <th className="py-2 pr-2 font-medium">{t('history.usedOn')}</th>
                  <th className="py-2 font-medium">{t('history.by')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-2 whitespace-nowrap text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-2">
                      <Badge
                        variant="outline"
                        className={
                          m.delta < 0
                            ? 'border-destructive/40 text-destructive'
                            : 'border-green-500/40 text-green-600'
                        }
                      >
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </Badge>
                    </td>
                    <td className="py-2 pr-2 font-medium">{m.quantityAfter}</td>
                    <td className="py-2 pr-2">
                      {m.serviceRecordId && m.vehicleId ? (
                        <Link
                          href={`/vehicles/${m.vehicleId}/service/${m.serviceRecordId}`}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {m.label}
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {m.label ?? reasonLabel(m.reason)}
                        </span>
                      )}
                      {m.vehicle && (
                        <span className="block text-xs text-muted-foreground">
                          {m.vehicle}
                        </span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {reasonLabel(m.reason)}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {m.userName ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
