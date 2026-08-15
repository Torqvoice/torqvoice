'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { createQuote } from '../Actions/quoteActions'
import { VehicleCombobox } from './VehicleCombobox'
import { CustomerCombobox } from './CustomerCombobox'

interface VehicleOption {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  customerId: string | null
  customer: { id: string; name: string } | null
}

interface CustomerOption {
  id: string
  name: string
  company: string | null
}

export function NewQuoteDialog({
  open,
  onOpenChange,
  defaultVehicle = null,
  defaultCustomer = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preselects the vehicle (and its label) when opening, e.g. from a vehicle page */
  defaultVehicle?: VehicleOption | null
  defaultCustomer?: CustomerOption | null
}) {
  const router = useRouter()
  const t = useTranslations('quotes')
  const [title, setTitle] = useState('')
  const [vehicleId, setVehicleId] = useState(defaultVehicle?.id ?? '')
  const [vehicleCustomerId, setVehicleCustomerId] = useState(defaultVehicle?.customerId ?? null)
  const [customerId, setCustomerId] = useState(defaultCustomer?.id ?? '')
  const [creating, setCreating] = useState(false)

  // Re-seed on every open so a previous session's selections don't leak in
  useEffect(() => {
    if (open) {
      setTitle('')
      setVehicleId(defaultVehicle?.id ?? '')
      setVehicleCustomerId(defaultVehicle?.customerId ?? null)
      setCustomerId(defaultCustomer?.id ?? '')
    }
  }, [open, defaultVehicle?.id, defaultCustomer?.id])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)

    const result = await createQuote({
      title: title.trim(),
      vehicleId: vehicleId || undefined,
      customerId: customerId || undefined,
      status: 'draft',
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      discountValue: 0,
      discountAmount: 0,
      totalAmount: 0,
    })

    if (result.success && result.data) {
      toast.success(t('form.created'))
      onOpenChange(false)
      router.push(`/quotes/${result.data.id}`)
    } else {
      toast.error(result.error || t('form.failedCreate'))
    }
    setCreating(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('form.newQuote')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-quote-title">{t('details.titleLabel')}</Label>
            <Input
              id="new-quote-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('details.titlePlaceholder')}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>{t('details.customer')}</Label>
            <CustomerCombobox
              value={customerId}
              initialCustomer={customerId === defaultCustomer?.id ? defaultCustomer : null}
              placeholder={t('details.selectCustomer')}
              noneLabel={t('details.none')}
              onChange={(id) => {
                setCustomerId(id)
                // A vehicle belonging to another customer no longer fits
                if (id && vehicleId && vehicleCustomerId !== id) {
                  setVehicleId('')
                  setVehicleCustomerId(null)
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('details.vehicle')}</Label>
            <VehicleCombobox
              value={vehicleId}
              customerId={customerId || undefined}
              initialVehicle={vehicleId === defaultVehicle?.id ? defaultVehicle : null}
              placeholder={t('details.selectVehicle')}
              noneLabel={t('details.none')}
              onChange={(id, vehicle) => {
                setVehicleId(id)
                setVehicleCustomerId(vehicle?.customerId ?? null)
                if (vehicle?.customerId) {
                  setCustomerId(vehicle.customerId)
                }
              }}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('form.cancel')}
            </Button>
            <Button type="submit" disabled={creating || !title.trim()}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('form.createQuote')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
