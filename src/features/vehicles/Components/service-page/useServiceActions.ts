import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useGlassModal } from '@/components/glass-modal'
import { useConfirm } from '@/components/confirm-dialog'
import { useTranslations } from 'next-intl'
import { saveServiceRecordChanges } from '@/features/vehicles/Actions/saveServiceRecordChanges'
import {
  deleteServiceRecord,
  deleteServiceAttachment,
  toggleManuallyPaid,
} from '@/features/vehicles/Actions/serviceActions'
import { createPayment, deletePayment } from '@/features/payments/Actions/paymentActions'
import { getSmsTemplates } from '@/features/sms/Actions/smsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { SMS_TEMPLATE_DEFAULTS, interpolateSmsTemplate } from '@/lib/sms-templates'
import { formatCurrency } from '@/lib/format'
import { findServiceFormProblem } from '@/features/vehicles/Lib/validateServiceForm'
import { useServiceType } from '@/components/service-type-context'
import { useFieldErrorText } from '@/components/field-errors'
import type { FieldError } from '@/lib/field-errors'
import { readingNeedsAnswer } from '@/features/vehicles/Lib/vehicleReading'
import { revealRequiredMeters } from '@/features/meters/Lib/requiredMetersReveal'
import type { ServiceDetail } from '../service-detail/types'
import type { WorkOrderFieldValues } from '@/features/vehicles/Lib/workOrderFields'
import type { useServiceFormState } from './useServiceFormState'

type FormState = ReturnType<typeof useServiceFormState>

export function useServiceActions({
  record,
  vehicleId,
  currencyCode,
  formState,
}: {
  record: ServiceDetail
  vehicleId: string | null
  currencyCode: string
  formState: FormState
}) {
  const router = useRouter()
  const modal = useGlassModal()
  const confirm = useConfirm()
  const t = useTranslations('service')
  const tc = useTranslations('common')
  const tv = useTranslations('vehicles.form')
  const readingKind = useServiceType() === 'marine' ? 'hours' : 'distance'
  const fieldErrorText = useFieldErrorText()

  /**
   * What the server's schema refused, in the person's language and under the
   * name the page gives the field: "Mileage: Can't be negative." A part or
   * labour line is named by its section. The field itself is focused when the
   * page draws it.
   */
  const describeFieldErrors = (form: HTMLFormElement, errors: FieldError[]): string => {
    const labelOf = (field: string): string | null => {
      const [head] = field.split('.')
      if (head === 'mileage') {
        return t(readingKind === 'hours' ? 'basicInfo.mileageMarine' : 'basicInfo.mileage')
      }
      if (head === 'partItems') return t('parts.title')
      if (head === 'laborItems') return t('labor.title')
      return null
    }
    const control = errors
      .map((error) => form.elements.namedItem(error.field))
      .find((el): el is HTMLInputElement => el instanceof HTMLInputElement)
    control?.focus()
    return errors
      .map((error) => {
        const problem = fieldErrorText(error)
        const label = labelOf(error.field)
        return label ? tc('fieldErrors.withLabel', { label, problem }) : problem
      })
      .join(' ')
  }

  const [carouselIndex, setCarouselIndex] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [deletingPayment, setDeletingPayment] = useState<string | null>(null)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [showPaymentNotifyDialog, setShowPaymentNotifyDialog] = useState(false)
  const [paymentNotifyMessage, setPaymentNotifyMessage] = useState('')

  const {
    selectedVehicleId,
    type,
    status,
    setStatus,
    concerns,
    partItems,
    laborItems,
    laborItemsForSave,
    laborAddedElsewhere,
    commitLaborAddedElsewhere,
    partItemsForSave,
    partsAddedElsewhere,
    commitPartsAddedElsewhere,
    isSavingRef,
    autosaveTimer,
    setLoading,
    setHasUnsavedChanges,
    flashSaved,
    initialData,
    customFieldsSaveRef,
    lastSaveErrorRef,
    leavingRef,
    autosaveRunRef,
    editRevisionRef,
    markSaved,
    markDirty,
    confirmedReadingRef,
    acknowledgeSavedLines,
    sendingLinesRef,
    fieldChanges,
    acknowledgeSavedFields,
    lineEditsForSave,
    settleLineEdits,
  } = formState

  /**
   * A save the rules refused. The reason is kept for the leave dialog; when a
   * link is waiting on this save, the dialog says it instead of a toast.
   */
  const refuse = (message: string, show: () => void = () => toast.error(message)) => {
    lastSaveErrorRef.current = message
    if (!leavingRef.current) show()
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    // Whether the autosave timer started this save, read once and spent.
    const autosave = autosaveRunRef.current
    autosaveRunRef.current = false
    if (isSavingRef.current) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    // Running from here: the custom fields go to the server before the rest,
    // and a link waiting on this save has to wait for that part too.
    isSavingRef.current = true
    // What this save covers. An edit made while it runs is newer, and keeps
    // the page unsaved once it lands.
    const revision = editRevisionRef.current

    // Validate and save custom fields before saving
    if (customFieldsSaveRef.current) {
      try {
        // A save the person asked for takes them to the first field at
        // fault; an autosave marks it and leaves them where they are typing.
        const outcome = await customFieldsSaveRef.current({ reveal: !autosave })
        if (!outcome.valid) {
          isSavingRef.current = false
          // Nothing of the work order was saved, and the message says so and
          // names the fields by the workshop's own labels. The server's own
          // words instead when it refused the whole save (the invoice locked
          // since the page was opened).
          refuse(
            outcome.error ??
              t(
                outcome.problem === 'invalid'
                  ? 'page.customFieldsNotValid'
                  : 'page.customFieldsMissing',
                { fields: (outcome.fields ?? []).join(', ') }
              )
          )
          return
        }
      } catch (err) {
        console.error('Custom fields save error:', err)
        isSavingRef.current = false
        refuse(t('page.customFieldsSaveFailed'))
        return
      }
    }

    /**
     * One field by name. There is exactly one of each since the layout stopped
     * drawing both breakpoints at once; this used to have to walk every
     * element of that name and pick whichever had an offsetParent, because
     * `FormData` handed back the hidden copy's value.
     *
     * Textareas as well as inputs: read as inputs only, a multi-line field
     * submitted nothing at all and did it quietly.
     */
    const getVisible = (name: string) =>
      form.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `input[name="${name}"], textarea[name="${name}"]`
      )?.value
    // What the browser would have refused, said in words it can show. The form
    // carries noValidate: an autosave goes through requestSubmit, which native
    // validation stops without a word, and half of these rules — a priced row
    // with no name — are not things a `required` attribute can express.
    const problem = findServiceFormProblem({
      title: getVisible('title') ?? '',
      partItems,
      laborItems,
      concerns,
    })
    if (problem) {
      isSavingRef.current = false
      refuse(t(`page.problems.${problem}`))
      return
    }

    setLoading(true)

    // Only the fields this page changed (fieldChanges): a field it did not
    // touch may have been saved in another tab since this one read it, and
    // sending this page's old copy back would throw that away. An emptied
    // field is a change, and is sent so the action clears it.
    const { current, changed } = fieldChanges()
    // A reading far above the last one waits for the person's answer under
    // the field (ReadingQuestion). Only the reading: the rest of the work
    // order saves, and the page stays unsaved until it is answered. The last
    // reading belongs to the saved vehicle, so a job being moved to another
    // one is not asked about.
    const holdReading =
      selectedVehicleId === vehicleId &&
      changed.includes('mileage') &&
      readingNeedsAnswer({
        value: current.mileage,
        saved: initialData.mileage,
        last: initialData.lastReading,
        kind: readingKind,
        confirmed: confirmedReadingRef.current,
      })
    const sentFields: Partial<WorkOrderFieldValues> = {}
    for (const field of changed) {
      // Left out, the job keeps the reading it has.
      if (field === 'mileage' && holdReading) continue
      Object.assign(sentFields, { [field]: current[field] })
    }
    const { discount, warranty, ...plainFields } = sentFields
    // Parts and labour only when this page changed them, and then the whole
    // list: lines a technician added while this page was open go with it
    // even if the offer to show them was never taken, since the save
    // replaces every line and one left out of it is deleted.
    const lines = lineEditsForSave({
      parts: partsAddedElsewhere.length,
      labor: laborAddedElsewhere.length,
    })
    const payload = {
      id: initialData.id,
      // Moving the job to another vehicle; null (a counter sale) is no change.
      ...(selectedVehicleId && selectedVehicleId !== vehicleId
        ? { vehicleId: selectedVehicleId }
        : {}),
      ...plainFields,
      ...(discount ?? {}),
      ...(warranty ?? {}),
      ...(lines.parts ? { partItems: partItemsForSave.filter((p) => p.name) } : {}),
      ...(lines.labor ? { laborItems: laborItemsForSave.filter((l) => l.description) } : {}),
      // No money: the server totals the job from what it stores.
    }

    let result: Awaited<ReturnType<typeof saveServiceRecordChanges>>
    // A refresh that lands while this runs must not take these lines, the
    // page's own, for ones added elsewhere.
    const sentLines = {
      parts: payload.partItems ?? partItemsForSave,
      labor: payload.laborItems ?? laborItemsForSave,
    }
    sendingLinesRef.current = sentLines
    try {
      result = await saveServiceRecordChanges(payload)
    } catch (err) {
      sendingLinesRef.current = null
      // The request never came back (the connection dropped). Saving has to
      // end here, or the next save, and a link waiting on this one, waits
      // forever.
      isSavingRef.current = false
      setLoading(false)
      throw err
    }
    sendingLinesRef.current = null

    if (result.success) {
      acknowledgeSavedFields(sentFields)
      settleLineEdits(lines)
      if (lines.labor) commitLaborAddedElsewhere()
      if (lines.parts) commitPartsAddedElsewhere()
      // The same on every save: a preset or an edit made while it ran, or
      // before the refresh after it comes back, leaves the page unsaved when
      // the saved lines arrive, and they must not read as added elsewhere.
      if (lines.parts || lines.labor) acknowledgeSavedLines(sentLines)
    }

    if (result.success && holdReading) {
      // Saved but for the reading: the page stays unsaved, without another
      // autosave unless something else is edited, and a link waiting on this
      // save asks the person to stay and answer.
      if (editRevisionRef.current !== revision) markDirty()
      lastSaveErrorRef.current = tv('readingConfirmWaiting')
      if (!autosave && !leavingRef.current) {
        // A save they asked for takes them to the question.
        const question = document.getElementById('reading-question')
        question?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
        question?.querySelector<HTMLButtonElement>('[data-reading-confirm]')?.focus()
      }
    } else if (result.success) {
      markSaved(revision)
      flashSaved()
      if (selectedVehicleId && selectedVehicleId !== vehicleId) {
        router.push(`/vehicles/${selectedVehicleId}/service/${initialData.id}`)
      } else {
        router.refresh()
      }
    } else if (result.requiredMeters) {
      // The save would have completed the job, or moved a completed one,
      // without readings the workshop requires. Back to the stage it is at,
      // the rest saved by the next save, and the message names the meters
      // whose boxes are marked. Only if the stage is still the one this save
      // sent: one picked while it ran is newer, and is what the next save
      // sends.
      setStatus((now) => (now === payload.status ? initialData.status : now))
      // The next save is queued only when it can go through: with the stage
      // put back. A completed job moved to another vehicle stays refused
      // until the person moves it back or reopens it, and a save every five
      // seconds would only say so again.
      if (
        editRevisionRef.current === revision &&
        payload.status !== undefined &&
        payload.status !== initialData.status
      ) {
        markDirty()
      }
      refuse(result.error || t('page.failedUpdate'))
      // A save they asked for takes them to the first empty box; an autosave,
      // or one a link is waiting on, only marks the boxes.
      revealRequiredMeters(initialData.id, result.requiredMeters, {
        focus: !autosave && !leavingRef.current,
      })
    } else if (result.fieldErrors?.length) {
      // Refused by the work order's own rules: said in words, nothing typed lost.
      refuse(describeFieldErrors(form, result.fieldErrors))
    } else {
      const message = result.error || t('page.failedUpdate')
      refuse(message, () => modal.open('error', tc('errors.error'), message))
    }

    isSavingRef.current = false
    setLoading(false)
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: t('page.deleteTitle'),
      description: t('page.deleteDescription'),
      confirmLabel: tc('buttons.delete'),
      icon: Trash2,
      destructive: true,
    })
    if (!ok) return
    // A pending autosave firing after the delete would hit a record that no
    // longer exists, so cancel it and block further saves before deleting.
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    isSavingRef.current = true
    // A request that never reaches the server throws instead of answering.
    // Uncaught, saving stayed blocked on a job that still exists, and every
    // later edit on the page was lost without a word.
    const result = await deleteServiceRecord(record.id).catch(() => null)
    if (result?.success) {
      setHasUnsavedChanges(false)
      router.push(vehicleId ? `/vehicles/${vehicleId}` : '/work-orders')
      router.refresh()
    } else {
      isSavingRef.current = false
      modal.open('error', tc('errors.error'), result?.error || t('page.failedDelete'))
    }
  }

  const handleDownloadPDF = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/protected/services/${record.id}/pdf`)
      if (!res.ok) throw new Error('Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        `invoice-${record.invoiceNumber || record.id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      modal.open('error', tc('errors.error'), t('payments.failedPdf'))
    }
    setDownloading(false)
  }

  const handleDeleteAttachment = async (id: string) => {
    const ok = await confirm({
      title: t('attachments.deleteTitle'),
      description: t('attachments.deleteDescription'),
      confirmLabel: tc('buttons.delete'),
      icon: Trash2,
      destructive: true,
    })
    if (!ok) return
    setDeletingAttachment(id)
    // An action that cannot reach the server throws instead of answering, here
    // and in the payment handlers below, so it is caught and reported the way
    // a refusal is, and the button it disabled works again.
    const result = await deleteServiceAttachment(id).catch(() => null)
    if (result?.success) {
      toast.success(t('attachments.deleted'))
      router.refresh()
    } else {
      modal.open('error', tc('errors.error'), result?.error || t('attachments.failedDelete'))
    }
    setDeletingAttachment(null)
  }

  const buildPaymentNotifyMessage = async (amount: string) => {
    const invoiceNum = record.invoiceNumber || `#${record.id.slice(-8).toUpperCase()}`
    // Templates that cannot be read fall back to the default wording: the
    // payment is already recorded by the time this runs.
    const tplResult = await getSmsTemplates().catch(() => null)
    const tplData = tplResult?.success && tplResult.data ? tplResult.data : null
    const tpl =
      tplData?.templates[SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED] ||
      SMS_TEMPLATE_DEFAULTS[SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED] ||
      ''
    setPaymentNotifyMessage(
      interpolateSmsTemplate(tpl, {
        amount,
        invoice_number: invoiceNum,
        customer_name: (record.customer ?? record.vehicle?.customer)?.name || '',
        company_name: tplData?.companyName || '',
        current_user: tplData?.currentUser || '',
      })
    )
    setShowPaymentNotifyDialog(true)
  }

  const handleCreatePayment = async (data: {
    amount: number
    date: string
    method: string
    note?: string
  }) => {
    setPaymentLoading(true)
    const result = await createPayment({ serviceRecordId: record.id, ...data }).catch(() => null)
    setPaymentLoading(false)
    if (result?.success) {
      toast.success(t('payments.recorded'))
      router.refresh()
      if (record.customer ?? record.vehicle?.customer) {
        await buildPaymentNotifyMessage(formatCurrency(data.amount, currencyCode))
      }
      return true
    }
    modal.open('error', tc('errors.error'), result?.error || t('payments.failedRecord'))
    return false
  }

  const handleTogglePaid = async () => {
    setPaymentLoading(true)
    const result = await toggleManuallyPaid(record.id).catch(() => null)
    setPaymentLoading(false)
    if (result?.success) {
      formState.setLocalManuallyPaid(!!result.data?.manuallyPaid)
      toast.success(
        result.data?.manuallyPaid ? t('payments.markedPaid') : t('payments.markedUnpaid')
      )
      router.refresh()
      if (result.data?.manuallyPaid && (record.customer ?? record.vehicle?.customer)) {
        await buildPaymentNotifyMessage('')
      }
    } else {
      modal.open('error', tc('errors.error'), result?.error || t('payments.failedStatus'))
    }
  }

  const handleDeletePayment = async (id: string) => {
    const ok = await confirm({
      title: t('payments.deleteTitle'),
      description: t('payments.deleteDescription'),
      confirmLabel: tc('buttons.delete'),
      icon: Trash2,
      destructive: true,
    })
    if (!ok) return
    setDeletingPayment(id)
    const result = await deletePayment(id).catch(() => null)
    if (result?.success) {
      toast.success(t('payments.deleted'))
      router.refresh()
    } else {
      modal.open('error', tc('errors.error'), result?.error || t('payments.failedDelete'))
    }
    setDeletingPayment(null)
  }

  return {
    // Action handlers
    handleSubmit,
    handleDelete,
    handleDownloadPDF,
    handleDeleteAttachment,
    handleCreatePayment,
    handleTogglePaid,
    handleDeletePayment,
    // Dialog/UI state
    downloading,
    deletingAttachment,
    paymentLoading,
    deletingPayment,
    showShareDialog,
    setShowShareDialog,
    showEmailDialog,
    setShowEmailDialog,
    showPaymentNotifyDialog,
    setShowPaymentNotifyDialog,
    paymentNotifyMessage,
    // Carousel
    carouselIndex,
    setCarouselIndex,
    onImageClick: setCarouselIndex,
    // Helpers
    saveNow: formState.saveNow,
  }
}
