'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DocsLink } from '@/components/docs-link'
import { useGlassModal } from '@/components/glass-modal'
import { toast } from 'sonner'
import { createCustomer, updateCustomer } from '../Actions/customerActions'
import { createVehicle } from '@/features/vehicles/Actions/vehicleActions'
import { ScanDocumentButton } from '@/features/vehicles/Components/ScanDocumentButton'
import type { VehicleDocumentScan } from '@/features/vehicles/Actions/aiAnalyzeVehicleDocument'
import { Loader2 } from 'lucide-react'

interface CustomerFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: {
    id: string
    customerNumber?: string | null
    name: string
    email?: string | null
    phone?: string | null
    address?: string | null
    company?: string | null
    taxId?: string | null
    taxExempt?: boolean
    reminderOptOut?: boolean
    notes?: string | null
  }
  /**
   * Prefills a new customer, e.g. with the keeper read off a scanned
   * registration document. Ignored when editing an existing customer.
   */
  defaults?: { name?: string; address?: string }
  onCreated?: (customer: { id: string; name: string; company: string | null }) => void
}

export function CustomerForm({
  open,
  onOpenChange,
  customer,
  defaults,
  onCreated,
}: CustomerFormProps) {
  const t = useTranslations('customers.form')
  const tc = useTranslations('common')
  const router = useRouter()
  const modal = useGlassModal()
  const tv = useTranslations('vehicles.form')
  const [loading, setLoading] = useState(false)
  const [taxExempt, setTaxExempt] = useState(customer?.taxExempt ?? false)
  const [reminderOptOut, setReminderOptOut] = useState(customer?.reminderOptOut ?? false)
  const formRef = useRef<HTMLFormElement>(null)
  /** Vehicle details from a scanned document, offered once the customer exists. */
  const [scannedVehicle, setScannedVehicle] = useState<VehicleDocumentScan | null>(null)
  const [addVehicle, setAddVehicle] = useState(true)

  const applyScan = (data: VehicleDocumentScan) => {
    const form = formRef.current
    if (form && data.owner) {
      const setIfEmpty = (name: string, value: string | undefined) => {
        if (!value) return
        const input = form.elements.namedItem(name) as HTMLInputElement | null
        if (input && !input.value) input.value = value
      }
      setIfEmpty('name', data.owner.name)
      setIfEmpty('address', data.owner.address)
    }

    // The papers describe a vehicle too, but only a complete one can be saved:
    // make, model and year are all required.
    const complete = Boolean(data.make && data.model && data.year)
    setScannedVehicle(complete ? data : null)
    setAddVehicle(true)
  }

  const vehicleLabel = (data: VehicleDocumentScan) =>
    [data.year, data.make, data.model].filter(Boolean).join(' ') +
    (data.licensePlate ? ` (${data.licensePlate})` : '')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get('name') as string,
      customerNumber: (formData.get('customerNumber') as string) || undefined,
      email: (formData.get('email') as string) || undefined,
      phone: (formData.get('phone') as string) || undefined,
      address: (formData.get('address') as string) || undefined,
      company: (formData.get('company') as string) || undefined,
      taxId: (formData.get('taxId') as string) || undefined,
      taxExempt,
      reminderOptOut,
      notes: (formData.get('notes') as string) || undefined,
    }

    const result = customer
      ? await updateCustomer({ ...data, id: customer.id })
      : await createCustomer(data)

    if (result.success) {
      toast.success(customer ? t('customerUpdated') : t('customerCreated'))
      const created = result.data as
        | { id: string; name: string; company: string | null }
        | undefined
      const customerId = customer?.id ?? created?.id

      // The scanned papers describe a vehicle too, and the customer it belongs
      // to only exists now.
      if (scannedVehicle && addVehicle && customerId) {
        const vehicleResult = await createVehicle({
          make: scannedVehicle.make as string,
          model: scannedVehicle.model as string,
          year: scannedVehicle.year as number,
          vin: scannedVehicle.vin,
          licensePlate: scannedVehicle.licensePlate,
          color: scannedVehicle.color,
          fuelType: scannedVehicle.fuelType,
          engineSize: scannedVehicle.engineSize,
          mileage: 0,
          customerId,
        })
        if (vehicleResult.success) {
          toast.success(tv('vehicleAdded'))
        } else {
          toast.error(vehicleResult.error || tv('saveError'))
        }
      }

      setScannedVehicle(null)
      onOpenChange(false)
      if (!customer && created && onCreated) {
        onCreated({ id: created.id, name: created.name, company: created.company ?? null })
      }
      router.refresh()
    } else {
      modal.open('error', tc('errors.error'), result.error || t('saveError'))
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{customer ? t('editTitle') : t('addTitle')}</DialogTitle>
          <DocsLink href="/docs/features/customers" variant="hint" className="self-start" />
          <DialogDescription className="sr-only">
            {customer ? t('editTitle') : t('addTitle')}
          </DialogDescription>
        </DialogHeader>

        <form
          key={customer?.id ?? `${defaults?.name ?? ''}|${defaults?.address ?? ''}`}
          ref={formRef}
          onSubmit={handleSubmit}
          className="grid gap-x-6 gap-y-4 md:grid-cols-2"
        >
          {/* The keeper on a registration document is a customer waiting to be typed in */}
          <div className="space-y-3 md:col-span-2">
            <ScanDocumentButton onScanned={applyScan} />

            {scannedVehicle && (
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
                <Checkbox
                  checked={addVehicle}
                  onCheckedChange={(next) => setAddVehicle(next === true)}
                />
                <span className="text-sm">
                  {t('addScannedVehicle', { vehicle: vehicleLabel(scannedVehicle) })}
                </span>
              </label>
            )}
          </div>

          {/* Left: who the customer is and how to reach them */}
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('sectionContact')}
            </p>

            <div className="grid grid-cols-[1fr_120px] gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('nameRequired')}</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder={t('namePlaceholder')}
                  defaultValue={customer?.name ?? defaults?.name ?? ''}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerNumber">{t('customerNumber')}</Label>
                <Input
                  id="customerNumber"
                  name="customerNumber"
                  placeholder={t('customerNumberAuto')}
                  defaultValue={customer?.customerNumber ?? ''}
                  maxLength={20}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">{tc('form.email')}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t('emailPlaceholder')}
                  defaultValue={customer?.email ?? ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{tc('form.phone')}</Label>
                <Input
                  id="phone"
                  name="phone"
                  placeholder={t('phonePlaceholder')}
                  defaultValue={customer?.phone ?? ''}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">{tc('form.address')}</Label>
              <Input
                id="address"
                name="address"
                placeholder={t('addressPlaceholder')}
                defaultValue={customer?.address ?? defaults?.address ?? ''}
              />
            </div>
          </div>

          {/* Right: who they are on an invoice */}
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('sectionBilling')}
            </p>

            <div className="space-y-2">
              <Label htmlFor="company">{tc('form.company')}</Label>
              <Input
                id="company"
                name="company"
                placeholder={t('companyPlaceholder')}
                defaultValue={customer?.company ?? ''}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxId">{t('taxId')}</Label>
              <Input
                id="taxId"
                name="taxId"
                placeholder={t('taxIdPlaceholder')}
                defaultValue={customer?.taxId ?? ''}
              />
              <p className="text-xs text-muted-foreground">{t('taxIdHint')}</p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label>{t('taxExempt')}</Label>
                <p className="text-xs text-muted-foreground">{t('taxExemptHint')}</p>
              </div>
              <Switch checked={taxExempt} onCheckedChange={setTaxExempt} />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label>{t('reminderOptOut')}</Label>
                <p className="text-xs text-muted-foreground">{t('reminderOptOutHint')}</p>
              </div>
              <Switch checked={reminderOptOut} onCheckedChange={setReminderOptOut} />
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">{tc('form.notes')}</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder={t('notesPlaceholder')}
              rows={3}
              defaultValue={customer?.notes ?? ''}
            />
          </div>

          <div className="flex justify-end gap-3 border-t pt-4 md:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('buttons.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {customer ? tc('buttons.saveChanges') : t('addTitle')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
