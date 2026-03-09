import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useGlassModal } from '@/components/glass-modal'
import { useConfirm } from '@/components/confirm-dialog'
import { useTranslations } from 'next-intl'
import { updateServiceRecord, deleteServiceRecord, deleteServiceAttachment, toggleManuallyPaid } from '@/features/vehicles/Actions/serviceActions'
import { createPayment, deletePayment } from '@/features/payments/Actions/paymentActions'
import { getSmsTemplates } from '@/features/sms/Actions/smsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { SMS_TEMPLATE_DEFAULTS, interpolateSmsTemplate } from '@/lib/sms-templates'
import { formatCurrency } from '@/lib/format'
import type { ServiceDetail } from '../service-detail/types'
import type { useServiceFormState } from './useServiceFormState'

type FormState = ReturnType<typeof useServiceFormState>

export function useServiceActions({
  record,
  vehicleId,
  currencyCode,
  formState,
}: {
  record: ServiceDetail
  vehicleId: string
  currencyCode: string
  formState: FormState
}) {
  const router = useRouter()
  const modal = useGlassModal()
  const confirm = useConfirm()
  const t = useTranslations('service')
  const tc = useTranslations('common')

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
    selectedVehicleId, techName, type, status,
    partItems, laborItems, subtotal, taxRate, taxAmount, totalAmount,
    discountType, discountValue, discountAmount,
    isSavingRef, autosaveTimer, setLoading,
    setHasUnsavedChanges, flashSaved, notesRef,
    initialData, customFieldsSaveRef,
  } = formState

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSavingRef.current) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)

    // Validate custom fields before saving
    if (customFieldsSaveRef.current) {
      const { valid } = await customFieldsSaveRef.current()
      if (!valid) {
        return
      }
    }

    isSavingRef.current = true
    setLoading(true)

    // Mobile + desktop layouts both render inputs with the same name.
    // formData.get() returns the first (hidden/stale) one, so read the visible input via offsetParent.
    const form = e.currentTarget
    const getVisible = (name: string) => {
      const inputs = form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)
      const visible = Array.from(inputs).find(el => el.offsetParent !== null)
      return visible?.value ?? new FormData(form).get(name) as string
    }
    const rawMileage = getVisible('mileage')
    const parsedMileage = rawMileage ? Number(rawMileage) || undefined : undefined

    const payload = {
      id: initialData.id,
      vehicleId: selectedVehicleId,
      title: getVisible('title'),
      description: notesRef.current.description || undefined,
      type,
      status,
      cost: totalAmount,
      mileage: parsedMileage,
      serviceDate: getVisible('serviceDate') || new Date().toISOString(),
      techName: techName || undefined,
      diagnosticNotes: notesRef.current.diagnosticNotes || undefined,
      invoiceNotes: notesRef.current.invoiceNotes || undefined,
      invoiceNumber: getVisible('invoiceNumber') || undefined,
      partItems: partItems.filter((p) => p.name),
      laborItems: laborItems.filter((l) => l.description),
      subtotal,
      taxRate,
      taxAmount,
      totalAmount,
      discountType: discountType === 'none' ? undefined : discountType,
      discountValue,
      discountAmount,
    }

    const result = await updateServiceRecord(payload)

    if (result.success) {
      setHasUnsavedChanges(false)
      flashSaved()
      if (selectedVehicleId !== vehicleId) {
        router.push(`/vehicles/${selectedVehicleId}/service/${initialData.id}`)
      } else {
        router.refresh()
      }
    } else {
      modal.open('error', tc('errors.error'), result.error || t('page.failedUpdate'))
    }

    isSavingRef.current = false
    setLoading(false)
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: t('page.deleteTitle'),
      description: t('page.deleteDescription'),
      confirmLabel: tc('buttons.delete'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteServiceRecord(record.id)
    if (result.success) {
      router.push(`/vehicles/${vehicleId}`)
      router.refresh()
    } else {
      modal.open('error', tc('errors.error'), result.error || t('page.failedDelete'))
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
      destructive: true,
    })
    if (!ok) return
    setDeletingAttachment(id)
    const result = await deleteServiceAttachment(id)
    if (result.success) {
      toast.success(t('attachments.deleted'))
      router.refresh()
    } else {
      modal.open('error', tc('errors.error'), result.error || t('attachments.failedDelete'))
    }
    setDeletingAttachment(null)
  }

  const buildPaymentNotifyMessage = async (amount: string) => {
    const invoiceNum = record.invoiceNumber || `#${record.id.slice(-8).toUpperCase()}`
    const tplResult = await getSmsTemplates()
    const tplData = tplResult.success && tplResult.data ? tplResult.data : null
    const tpl = tplData?.templates[SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED] || SMS_TEMPLATE_DEFAULTS[SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED] || ''
    setPaymentNotifyMessage(
      interpolateSmsTemplate(tpl, {
        amount,
        invoice_number: invoiceNum,
        customer_name: record.vehicle.customer?.name || '',
        company_name: tplData?.companyName || '',
        current_user: tplData?.currentUser || '',
      })
    )
    setShowPaymentNotifyDialog(true)
  }

  const handleCreatePayment = async (data: { amount: number; date: string; method: string; note?: string }) => {
    setPaymentLoading(true)
    const result = await createPayment({ serviceRecordId: record.id, ...data })
    setPaymentLoading(false)
    if (result.success) {
      toast.success(t('payments.recorded'))
      router.refresh()
      if (record.vehicle.customer) {
        await buildPaymentNotifyMessage(formatCurrency(data.amount, currencyCode))
      }
      return true
    }
    modal.open('error', tc('errors.error'), result.error || t('payments.failedRecord'))
    return false
  }

  const handleTogglePaid = async () => {
    setPaymentLoading(true)
    const result = await toggleManuallyPaid(record.id)
    setPaymentLoading(false)
    if (result.success) {
      toast.success(result.data?.manuallyPaid ? t('payments.markedPaid') : t('payments.markedUnpaid'))
      router.refresh()
      if (result.data?.manuallyPaid && record.vehicle.customer) {
        await buildPaymentNotifyMessage('')
      }
    } else {
      modal.open('error', tc('errors.error'), result.error || t('payments.failedStatus'))
    }
  }

  const handleDeletePayment = async (id: string) => {
    const ok = await confirm({
      title: t('payments.deleteTitle'),
      description: t('payments.deleteDescription'),
      confirmLabel: tc('buttons.delete'),
      destructive: true,
    })
    if (!ok) return
    setDeletingPayment(id)
    const result = await deletePayment(id)
    if (result.success) {
      toast.success(t('payments.deleted'))
      router.refresh()
    } else {
      modal.open('error', tc('errors.error'), result.error || t('payments.failedDelete'))
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
    showShareDialog, setShowShareDialog,
    showEmailDialog, setShowEmailDialog,
    showPaymentNotifyDialog, setShowPaymentNotifyDialog,
    paymentNotifyMessage,
    // Carousel
    carouselIndex, setCarouselIndex,
    onImageClick: setCarouselIndex,
    // Helpers
    saveNow: formState.saveNow,
  }
}
