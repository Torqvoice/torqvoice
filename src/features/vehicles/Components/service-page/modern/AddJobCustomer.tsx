'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Plus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useBookingAccess } from '@/components/booking-launcher'
import { useServiceType } from '@/components/service-type-context'
import { handleGated } from '@/components/upgrade-gate'
import { CustomerForm } from '@/features/customers/Components/CustomerForm'
import { CustomerCombobox } from '@/features/quotes/Components/CustomerCombobox'
import { updateVehicle } from '../../../Actions/vehicleActions'
import type { ServiceDetail } from '../../service-detail/types'

type JobCustomer = NonNullable<ServiceDetail['customer']>

/** The customer added from the work order, and the vehicle it was put on. */
export interface AddedCustomer {
  vehicleId: string
  customer: JobCustomer
}

interface PickedCustomer {
  id: string
  name: string
  company: string | null
}

/**
 * The Customer box of a job whose vehicle has no owner. The sentence used to
 * be all there was, and people clicked it expecting to add one: now it and
 * the button under it open the customer picker the vehicle form uses, with
 * the same way to add a new customer. The customer picked becomes the
 * vehicle's owner, which is where a work order reads its customer from.
 */
export function AddJobCustomer({
  vehicleId,
  onAdded,
}: {
  vehicleId: string
  onAdded: (customer: JobCustomer) => void
}) {
  const t = useTranslations('service.modern')
  const tv = useTranslations('vehicles.form')
  const isMarine = useServiceType() === 'marine'
  const { canAddCustomer } = useBookingAccess()
  const sentenceId = useId()
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  // What was typed in the search when "Add customer" was chosen: the new
  // customer's form starts from it.
  const [newName, setNewName] = useState('')

  const save = async (picked: PickedCustomer) => {
    setSaving(true)
    // An action that cannot reach the server throws instead of answering, so
    // it is reported the way a refusal is and the picker comes back.
    const result = await updateVehicle({ id: vehicleId, customerId: picked.id }).catch(() => null)
    setSaving(false)
    if (!result?.success) {
      if (!result || !handleGated(result)) toast.error(result?.error || t('addCustomerFailed'))
      return
    }
    // Enough to fill the box at once; the page reads the rest (phone, email)
    // when it loads the job again.
    onAdded({
      id: picked.id,
      name: picked.name,
      company: picked.company,
      email: null,
      phone: null,
      address: null,
      telegramChatId: null,
    })
  }

  return (
    <div className="space-y-2">
      {/* A second way in for the mouse: the sentence is where people clicked.
          The button under it is the control the keyboard reaches. */}
      <p
        id={sentenceId}
        className={
          picking ? 'text-sm text-muted-foreground' : 'cursor-pointer text-sm text-muted-foreground'
        }
        onClick={picking ? undefined : () => setPicking(true)}
      >
        {t('noCustomer')}
      </p>
      {saving ? (
        <div className="flex h-9 items-center" role="status" aria-label={t('addCustomer')}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : picking ? (
        <>
          <CustomerCombobox
            defaultOpen
            showAvatar
            value=""
            placeholder={tv('searchCustomers')}
            noneLabel={tv('noCustomer')}
            emptyLabel={tv('noCustomerFound')}
            onChange={(_id, picked) => {
              if (picked) void save(picked)
              else setPicking(false)
            }}
            footer={
              canAddCustomer
                ? (close, search) => (
                    <div className="border-t p-1">
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                        onClick={() => {
                          close()
                          setNewName(search.trim())
                          setShowCustomerForm(true)
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        {tv('addCustomer')}
                      </button>
                    </div>
                  )
                : undefined
            }
          />
          <p className="text-xs text-muted-foreground">
            {isMarine ? t('addCustomerHintMarine') : t('addCustomerHint')}
          </p>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-describedby={sentenceId}
          onClick={() => setPicking(true)}
        >
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          {t('addCustomer')}
        </Button>
      )}
      <CustomerForm
        open={showCustomerForm}
        onOpenChange={setShowCustomerForm}
        defaults={newName ? { name: newName } : undefined}
        onCreated={(created) => void save(created)}
      />
    </div>
  )
}
