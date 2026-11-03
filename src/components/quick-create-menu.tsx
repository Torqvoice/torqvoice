'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Loader2,
  Wrench,
  Users,
  Car,
  FileText,
  Package,
  ClipboardCheck,
  UserPlus,
} from 'lucide-react'
import { VehiclePickerDialog } from '@/components/vehicle-picker-dialog'
import { NewInspectionDialog } from '@/features/inspections/Components/NewInspectionDialog'
import { getTemplates } from '@/features/inspections/Actions/templateActions'

interface TemplateOption {
  id: string
  name: string
  isDefault: boolean
}

export function QuickCreateMenu() {
  const t = useTranslations('navigation')
  const router = useRouter()
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false)
  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState<TemplateOption[]>([])

  // The picker searches vehicles itself, so there is nothing to load first.
  const handleNewWorkOrder = () => {
    setVehicleDialogOpen(true)
  }

  const handleNewInspection = async () => {
    setLoading(true)
    try {
      const result = await getTemplates()
      setTemplates(
        result.success && result.data
          ? result.data.map((t) => ({
              id: t.id,
              name: t.name,
              isDefault: t.isDefault,
            }))
          : []
      )
      setInspectionDialogOpen(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3.5 w-3.5" />
            )}
            {t('quickCreate.title')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>{t('quickCreate.title')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleNewWorkOrder}>
            <Wrench className="h-4 w-4" />
            {t('quickCreate.workOrder')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/customers?create=true')}>
            <Users className="h-4 w-4" />
            {t('quickCreate.customer')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/vehicles?create=true')}>
            <Car className="h-4 w-4" />
            {t('quickCreate.vehicle')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/quotes?create=true')}>
            <FileText className="h-4 w-4" />
            {t('quickCreate.quote')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/inventory?create=true')}>
            <Package className="h-4 w-4" />
            {t('quickCreate.part')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleNewInspection}>
            <ClipboardCheck className="h-4 w-4" />
            {t('quickCreate.inspection')}
          </DropdownMenuItem>

          {/* Everything above creates a record. This creates a person, which
              is a different kind of act and belongs behind its own heading:
              adding a mechanic is not the same errand as booking a car in. */}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('quickCreate.shopActions')}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => router.push('/settings/team?add=true')}>
            <UserPlus className="mr-2 h-4 w-4" />
            {t('quickCreate.person')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <VehiclePickerDialog open={vehicleDialogOpen} onOpenChange={setVehicleDialogOpen} />
      <NewInspectionDialog
        open={inspectionDialogOpen}
        onOpenChange={setInspectionDialogOpen}
        templates={templates}
      />
    </>
  )
}
