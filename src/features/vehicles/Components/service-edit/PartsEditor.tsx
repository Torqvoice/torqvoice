'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Package, Plus, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'
import { emptyPart } from './form-types'

interface PartsEditorProps {
  partItems: ServicePartInput[]
  setPartItems: React.Dispatch<React.SetStateAction<ServicePartInput[]>>
  updatePart: (index: number, field: keyof ServicePartInput, value: string | number) => void
  partsSubtotal: number
  currencyCode: string
  hasInventory: boolean
  onOpenInventory: () => void
}

export function PartsEditor({
  partItems,
  setPartItems,
  updatePart,
  partsSubtotal,
  currencyCode,
  hasInventory,
  onOpenInventory,
}: PartsEditorProps) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Parts</h3>
        <div className="flex gap-2">
          {hasInventory && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenInventory}>
              <Package className="mr-1 h-3.5 w-3.5" />
              From Inventory
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPartItems((prev) => [...prev, emptyPart()])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Part
          </Button>
        </div>
      </div>

      {partItems.length > 0 && (
        <>
          <div className="hidden grid-cols-[1fr_2fr_0.7fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>Part #</span>
            <span>Name</span>
            <span>Qty</span>
            <span>Unit Price</span>
            <span>Total</span>
            <span />
          </div>
          {partItems.map((part, i) => (
            <div
              key={i}
              className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_2fr_0.7fr_1fr_1fr_auto]"
            >
              <Input
                placeholder="Part #"
                value={part.partNumber ?? ''}
                onChange={(e) => updatePart(i, 'partNumber', e.target.value)}
              />
              <Textarea
                placeholder="Name *"
                value={part.name}
                onChange={(e) => updatePart(i, 'name', e.target.value)}
                rows={1}
                className="min-h-9 resize-none"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={part.quantity}
                onChange={(e) => updatePart(i, 'quantity', e.target.value)}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={part.unitPrice}
                onChange={(e) => updatePart(i, 'unitPrice', e.target.value)}
              />
              <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">
                {formatCurrency(part.total, currencyCode)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => setPartItems((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            onClick={() => setPartItems((prev) => [...prev, emptyPart()])}
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="flex justify-end pt-1 text-sm">
            <span className="font-medium">
              Parts Subtotal: {formatCurrency(partsSubtotal, currencyCode)}
            </span>
          </div>
        </>
      )}

      {partItems.length === 0 && (
        <button
          type="button"
          className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
          onClick={() => setPartItems((prev) => [...prev, emptyPart()])}
        >
          <Plus className="mr-1 h-4 w-4" />
          <span className="text-sm">Add Part</span>
        </button>
      )}
    </div>
  )
}
