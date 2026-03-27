'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Link from 'next/link'
import { CalendarIcon, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useServiceType } from '@/components/service-type-context'
import type { InitialData } from './form-types'
import { VehicleCombobox } from '@/features/quotes/Components/VehicleCombobox'

interface CustomerInfo {
  id: string
  name: string
  company: string | null
}

interface BasicInfoSectionProps {
  initialData: InitialData
  vehicleId: string
  vehicleName: string
  selectedVehicleId: string
  setSelectedVehicleId: (id: string) => void
  type: string
  setType: (type: string) => void
  status: string
  setStatus: (status: string) => void
  techName: string
  customer?: CustomerInfo | null
  initialVehicle?: { id: string; make: string; model: string; year: number; licensePlate: string | null } | null
  onDirty?: () => void
}

export function BasicInfoSection({
  initialData,
  vehicleName,
  selectedVehicleId,
  setSelectedVehicleId,
  type,
  setType,
  status,
  setStatus,
  techName,
  customer,
  initialVehicle,
  onDirty,
}: BasicInfoSectionProps) {
  const t = useTranslations('service.basicInfo')
  const serviceType = useServiceType()
  const [invoiceDate, setInvoiceDate] = useState<Date | undefined>(
    initialData.invoiceDate ? new Date(initialData.invoiceDate + 'T00:00:00') : undefined
  )
  const [invoiceDueDate, setInvoiceDueDate] = useState<Date | undefined>(
    initialData.invoiceDueDate ? new Date(initialData.invoiceDueDate + 'T00:00:00') : undefined
  )

  const formatDate = (date: Date | undefined) => {
    if (!date) return ''
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const toISODate = (date: Date | undefined) => {
    if (!date) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <h3 className="text-sm font-semibold">{t('title')}</h3>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t('vehicle')}</Label>
          <Link
            href={`/vehicles/${selectedVehicleId}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('open')}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <VehicleCombobox
          value={selectedVehicleId}
          initialVehicle={initialVehicle ? { ...initialVehicle, customerId: null, customer: null } : null}
          placeholder={vehicleName || t('searchVehicles')}
          noneLabel={t('noVehicleFound')}
          onChange={(id) => {
            if (id) setSelectedVehicleId(id)
          }}
        />
      </div>

      {customer && (
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t('customer')}</p>
            <Link
              href={`/customers/${customer.id}`}
              className="text-sm font-medium hover:underline"
            >
              {customer.name}
            </Link>
            {customer.company && (
              <p className="text-xs text-muted-foreground">{customer.company}</p>
            )}
          </div>
          <Link
            href={`/customers/${customer.id}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('open')}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="title" className="text-xs">{t('titleLabel')}</Label>
        <Input
          id="title"
          name="title"
          placeholder={t('titlePlaceholder')}
          defaultValue={initialData.title}
          maxLength={100}
          required
        />
      </div>

      {/* Hidden serviceDate — kept for form submission, visible scheduling is in ScheduleTimesSection */}
      <input
        type="hidden"
        name="serviceDate"
        value={initialData.serviceDate || new Date().toISOString().split('T')[0]}
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t('type')}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="maintenance">{t('typeOptions.maintenance')}</SelectItem>
              <SelectItem value="repair">{t('typeOptions.repair')}</SelectItem>
              <SelectItem value="upgrade">{t('typeOptions.upgrade')}</SelectItem>
              <SelectItem value="inspection">{t('typeOptions.inspection')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('status')}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">{t('statusOptions.pending')}</SelectItem>
              <SelectItem value="in-progress">{t('statusOptions.in_progress')}</SelectItem>
              <SelectItem value="waiting-parts">{t('statusOptions.waiting_parts')}</SelectItem>
              <SelectItem value="completed">{t('statusOptions.completed')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="mileage" className="text-xs">{serviceType === 'boat' ? t('mileageBoat') : t('mileage')}</Label>
        <Input
          id="mileage"
          name="mileage"
          type="number"
          placeholder="50000"
          defaultValue={initialData.mileage ?? ''}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="invoiceNumber" className="text-xs">{t('invoiceNumber')}</Label>
        <Input
          id="invoiceNumber"
          name="invoiceNumber"
          placeholder="2026-1001"
          defaultValue={initialData.invoiceNumber || ''}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t('invoiceDate')}</Label>
          <input type="hidden" name="invoiceDate" value={toISODate(invoiceDate)} />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn('w-full justify-start text-left font-normal h-9 text-sm', !invoiceDate && 'text-muted-foreground')}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {invoiceDate ? formatDate(invoiceDate) : t('invoiceDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={invoiceDate} onSelect={(d) => { setInvoiceDate(d); onDirty?.() }} />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('invoiceDueDate')}</Label>
          <input type="hidden" name="invoiceDueDate" value={toISODate(invoiceDueDate)} />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn('w-full justify-start text-left font-normal h-9 text-sm', !invoiceDueDate && 'text-muted-foreground')}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {invoiceDueDate ? formatDate(invoiceDueDate) : t('invoiceDueDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={invoiceDueDate} onSelect={(d) => { setInvoiceDueDate(d); onDirty?.() }} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <input type="hidden" name="techName" value={techName} />
    </div>
  )
}
