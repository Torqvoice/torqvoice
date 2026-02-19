'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'
import type { InventoryPartOption } from './form-types'

interface InventoryPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inventoryParts: InventoryPartOption[]
  currencyCode: string
  onSelectPart: (part: ServicePartInput) => void
}

export function InventoryPickerDialog({
  open,
  onOpenChange,
  inventoryParts,
  currencyCode,
  onSelectPart,
}: InventoryPickerDialogProps) {
  const [search, setSearch] = useState('')

  const filtered = inventoryParts.filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    )
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) setSearch('')
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Part from Inventory</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search inventory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="max-h-75 overflow-y-auto space-y-1">
          {filtered.map((ip) => (
            <button
              key={ip.id}
              type="button"
              className="w-full text-left rounded-md p-2.5 hover:bg-accent transition-colors"
              onClick={() => {
                const price = ip.sellPrice > 0 ? ip.sellPrice : ip.unitCost;
                onSelectPart({
                  partNumber: ip.partNumber || '',
                  name: ip.name,
                  quantity: 1,
                  unitPrice: price,
                  total: price,
                  inventoryPartId: ip.id,
                })
                onOpenChange(false)
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{ip.name}</span>
                  {ip.partNumber && (
                    <span className="ml-2 text-xs font-mono text-muted-foreground">
                      {ip.partNumber}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{ip.quantity} in stock</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {ip.category && <span>{ip.category}</span>}
                {ip.sellPrice > 0 ? (
                  <>
                    <span className="font-medium text-foreground">{formatCurrency(ip.sellPrice, currencyCode)}</span>
                    <span className="line-through">{formatCurrency(ip.unitCost, currencyCode)}</span>
                  </>
                ) : (
                  <span>{formatCurrency(ip.unitCost, currencyCode)}</span>
                )}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No inventory parts found.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
