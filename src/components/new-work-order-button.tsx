'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { VehiclePickerDialog } from '@/components/vehicle-picker-dialog'

export function NewWorkOrderButton() {
  const t = useTranslations('navigation')
  const [open, setOpen] = useState(false)

  // The picker searches vehicles itself, so there is nothing to load first.
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        {t('newWorkOrder')}
      </Button>
      <VehiclePickerDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
