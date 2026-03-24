'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Pencil, Plus, Package } from 'lucide-react'
import { adjustInventoryStock } from '../Actions/inventoryActions'
import { toast } from 'sonner'

interface BarcodeScanActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  part: {
    id: string
    name: string
    partNumber: string | null
    barcode: string | null
    quantity: number
    category: string | null
  } | null
  barcode: string
  onEditPart: (partId: string) => void
  onCreatePart: (barcode: string) => void
}

export function BarcodeScanActionDialog({
  open,
  onOpenChange,
  part,
  barcode,
  onEditPart,
  onCreatePart,
}: BarcodeScanActionDialogProps) {
  const t = useTranslations('inventory.barcodeScan')
  const [customQty, setCustomQty] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAddStock = async (amount: number) => {
    if (!part) return
    setLoading(true)
    const result = await adjustInventoryStock({ id: part.id, adjustment: amount })
    setLoading(false)
    if (result.success) {
      toast.success(t('addedStock', { amount }))
      onOpenChange(false)
    }
  }

  const handleCustomAdd = async () => {
    const qty = parseInt(customQty, 10)
    if (qty > 0) await handleAddStock(qty)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        {part ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <p className="font-medium">{part.name}</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                {part.partNumber && <span className="font-mono">{part.partNumber}</span>}
                {part.category && <Badge variant="secondary" className="text-xs">{part.category}</Badge>}
              </div>
              <p className="mt-1 text-sm">{t('currentStock', { quantity: part.quantity })}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('addStock')}</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleAddStock(1)} disabled={loading}>
                  +1
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleAddStock(5)} disabled={loading}>
                  +5
                </Button>
                <div className="flex flex-1 gap-1">
                  <Input
                    type="number"
                    min="1"
                    placeholder={t('customAmount')}
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    className="h-8"
                  />
                  <Button size="sm" onClick={handleCustomAdd} disabled={loading || !customQty}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onOpenChange(false)
                onEditPart(part.id)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t('editPart')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed p-4 text-center">
              <Package className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                {t('notFound', { barcode })}
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                onOpenChange(false)
                onCreatePart(barcode)
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('createNew')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
