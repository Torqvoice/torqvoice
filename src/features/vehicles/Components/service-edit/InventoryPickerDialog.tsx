'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search } from 'lucide-react'
import { useFormatCurrency } from '@/components/currency-settings-context'
import type { ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'
import type { InventoryPartOption } from './form-types'

const PAGE_SIZE = 100

interface InventoryPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inventoryParts: InventoryPartOption[]
  currencyCode: string
  onSelectPart: (part: ServicePartInput) => void
  /** Default markup % to apply when markupAppliesToInventory is true. */
  defaultMarkupPercent?: number
  /** When true, picked inventory parts use cost + default markup instead of sellPrice. */
  markupAppliesToInventory?: boolean
}

export function InventoryPickerDialog({
  open,
  onOpenChange,
  inventoryParts,
  currencyCode,
  onSelectPart,
  defaultMarkupPercent = 0,
  markupAppliesToInventory = false,
}: InventoryPickerDialogProps) {
  const formatCurrency = useFormatCurrency()
  const t = useTranslations('service.parts')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = inventoryParts.filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    )
  })

  const visible = filtered.slice(0, visibleCount)

  // Reset visible count when search changes or dialog opens
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, open])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      setVisibleCount((prev) => {
        if (prev >= filtered.length) return prev
        return prev + PAGE_SIZE
      })
    }
  }, [filtered.length])

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) setSearch('')
      }}
    >
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('inventoryTitle')}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('searchInventory')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div ref={listRef} onScroll={handleScroll} className="max-h-75 overflow-y-auto space-y-1">
          {visible.map((ip) => (
            <button
              key={ip.id}
              type="button"
              className="w-full text-left rounded-md px-2.5 py-1.5 hover:bg-accent transition-colors flex items-center justify-between gap-4"
              onClick={() => {
                // When markup-applies-to-inventory is enabled, recompute the sell price
                // from cost + default markup. Otherwise fall back to the inventory's
                // own sellPrice (which has its own separate markup system).
                const useGlobalMarkup = markupAppliesToInventory && defaultMarkupPercent > 0
                const price = useGlobalMarkup
                  ? Math.round(ip.unitCost * (1 + defaultMarkupPercent / 100) * 100) / 100
                  : ip.sellPrice > 0
                    ? ip.sellPrice
                    : ip.unitCost
                onSelectPart({
                  partNumber: ip.partNumber || '',
                  name: ip.name,
                  quantity: 1,
                  unitPrice: price,
                  total: price,
                  unitCost: ip.unitCost,
                  markupPercent: useGlobalMarkup ? defaultMarkupPercent : 0,
                  inventoryPartId: ip.id,
                })
                onOpenChange(false)
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{ip.name}</span>
                  {ip.partNumber && (
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {ip.partNumber}
                    </span>
                  )}
                  {ip.barcode && (
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {ip.barcode}
                    </span>
                  )}
                  {ip.category && (
                    <span className="text-xs text-muted-foreground shrink-0">{ip.category}</span>
                  )}
                </div>
                {ip.description && (
                  <p className="text-xs text-muted-foreground truncate">{ip.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                {ip.sellPrice > 0 ? (
                  <>
                    <span className="font-medium text-foreground">
                      {formatCurrency(ip.sellPrice, currencyCode)}
                    </span>
                    <span className="line-through">
                      {formatCurrency(ip.unitCost, currencyCode)}
                    </span>
                  </>
                ) : (
                  <span>{formatCurrency(ip.unitCost, currencyCode)}</span>
                )}
                <span>{t('inStock', { quantity: ip.quantity })}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('noInventory')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
