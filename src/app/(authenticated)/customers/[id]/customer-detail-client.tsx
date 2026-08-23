'use client'

import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { interactiveRow } from '@/lib/interactive-row'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Building2,
  Car,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Send,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { SmsConversation } from '@/features/sms/Components/SmsConversation'
import { WhatsappConversation } from '@/features/whatsapp/Components/WhatsappConversation'
import { TelegramConversation } from '@/features/telegram/Components/TelegramConversation'
import { CustomerForm } from '@/features/customers/Components/CustomerForm'
import { VehicleForm } from '@/features/vehicles/Components/VehicleForm'
import {
  updateServiceRequest,
  createWorkOrderFromRequest,
} from '@/features/customers/Actions/customerActions'
import { SendSmsDialog } from '@/features/sms/Components/SendSmsDialog'
import { TelegramQrCode } from '@/features/telegram/Components/TelegramQrCode'
import { useServiceType } from '@/components/service-type-context'
import { toast } from 'sonner'

interface ServiceRequestItem {
  id: string
  description: string
  preferredDate: Date | null
  status: string
  adminNotes: string | null
  createdAt: Date
  vehicle: { id: string; make: string; model: string; year: number }
}

interface CustomerDetail {
  id: string
  customerNumber: string | null
  name: string
  email: string | null
  phone: string | null
  address: string | null
  company: string | null
  taxId: string | null
  taxExempt: boolean
  notes: string | null
  vehicles: {
    id: string
    make: string
    model: string
    year: number
    mileage: number
    licensePlate: string | null
    _count: { serviceRecords: number }
  }[]
  serviceRequests?: ServiceRequestItem[]
}

interface SmsMessage {
  id: string
  direction: string
  body: string
  status: string
  createdAt: string | Date
  fromNumber: string
  toNumber: string
}

export function CustomerDetailClient({
  customer,
  customers = [],
  unitSystem = 'imperial',
  smsEnabled = false,
  smsMessages = [],
  smsNextCursor = null,
  telegramEnabled = false,
  whatsappEnabled = false,
  telegramBotUsername = null,
  telegramMessages = [],
  telegramNextCursor = null,
  telegramChatId = null,
}: {
  customer: CustomerDetail
  customers?: { id: string; name: string; company: string | null }[]
  unitSystem?: 'metric' | 'imperial'
  smsEnabled?: boolean
  smsMessages?: SmsMessage[]
  smsNextCursor?: string | null
  telegramEnabled?: boolean
  whatsappEnabled?: boolean
  telegramBotUsername?: string | null
  telegramMessages?: {
    id: string
    direction: string
    body: string
    status: string
    createdAt: string | Date
    chatId: string
  }[]
  telegramNextCursor?: string | null
  telegramChatId?: string | null
}) {
  const t = useTranslations('customers.detail')
  const tVehicles = useTranslations('vehicles.list')
  const serviceType = useServiceType()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showEditForm, setShowEditForm] = useState(false)
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const tableNav = useTableKeyboardNav()

  const tabParam = searchParams.get('tab')
  const activeTab =
    tabParam === 'sms' && smsEnabled
      ? 'sms'
      : tabParam === 'whatsapp' && whatsappEnabled
        ? 'whatsapp'
        : tabParam === 'telegram' && telegramEnabled
          ? 'telegram'
          : tabParam === 'messages' && smsEnabled
            ? 'sms'
            : tabParam === 'requests'
              ? 'requests'
              : 'vehicles'

  const setActiveTab = (tab: 'vehicles' | 'sms' | 'whatsapp' | 'telegram' | 'requests') => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'vehicles') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const qs = params.toString()
    router.replace(`/customers/${customer.id}${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  const hasContactInfo =
    customer.email ||
    customer.phone ||
    customer.address ||
    customer.company ||
    customer.taxId ||
    customer.notes

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Link
          href="/customers"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToCustomers')}
        </Link>

        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="flex items-baseline gap-2 text-2xl font-bold">
              {customer.name}
              {customer.customerNumber && (
                <span className="font-mono text-sm font-normal text-muted-foreground">
                  #{customer.customerNumber}
                </span>
              )}
            </h1>
            {hasContactInfo && (
              <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                {customer.company && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>{customer.company}</span>
                  </div>
                )}
                {customer.email && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(customer.email!)
                      toast.success(t('emailCopied'))
                    }}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>{customer.email}</span>
                  </button>
                )}
                {customer.phone && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(customer.phone!)
                      toast.success(t('phoneCopied'))
                    }}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    <span>{customer.phone}</span>
                  </button>
                )}
                {customer.address && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{customer.address}</span>
                  </div>
                )}
                {customer.taxId && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="font-medium">{t('taxIdLabel')}:</span>
                    <span>{customer.taxId}</span>
                  </div>
                )}
                {customer.taxExempt && (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    {t('taxExemptBadge')}
                  </span>
                )}
              </div>
            )}
            {customer.notes && (
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {customer.notes}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {telegramBotUsername && (
              <TelegramQrCode
                botUsername={telegramBotUsername}
                customerId={customer.id}
                customerName={customer.name}
                customerEmail={customer.email}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditForm(true)}
              aria-label={t('editCustomer')}
              title={t('editCustomer')}
              className="h-9 w-9 p-0 md:h-8 md:w-auto md:px-3"
            >
              <Pencil className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
              <span className="hidden md:inline">{t('editCustomer')}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        {/* Scrolls sideways on phones rather than wrapping the tab strip. */}
        <div className="mb-4 flex gap-1 overflow-x-auto border-b">
          <button
            type="button"
            onClick={() => setActiveTab('vehicles')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'vehicles'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Car className="h-4 w-4" />
            {t('tabs.vehicles', { count: customer.vehicles.length })}
          </button>
          {smsEnabled && (
            <button
              type="button"
              onClick={() => setActiveTab('sms')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === 'sms'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <MessageSquare className="h-4 w-4" />
              {t('tabs.sms')}
            </button>
          )}
          {whatsappEnabled && (
            <button
              type="button"
              onClick={() => setActiveTab('whatsapp')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === 'whatsapp'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <MessageCircle className="h-4 w-4" />
              {t('tabs.whatsapp')}
            </button>
          )}
          {telegramEnabled && (
            <button
              type="button"
              onClick={() => setActiveTab('telegram')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === 'telegram'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Send className="h-4 w-4" />
              {t('tabs.telegram')}
            </button>
          )}
          {(customer.serviceRequests?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === 'requests'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Wrench className="h-4 w-4" />
              {t('tabs.requests', { count: customer.serviceRequests!.length })}
            </button>
          )}
        </div>

        {activeTab === 'vehicles' && (
          <>
            <div className="mb-3 flex justify-end">
              <Button
                size="sm"
                onClick={() => setShowVehicleForm(true)}
                aria-label={tVehicles('addVehicle')}
                title={tVehicles('addVehicle')}
                className="h-9 w-9 p-0 md:h-8 md:w-auto md:px-3"
              >
                <Plus className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
                <span className="hidden md:inline">{tVehicles('addVehicle')}</span>
              </Button>
            </div>
            <VehicleForm
              open={showVehicleForm}
              onOpenChange={setShowVehicleForm}
              customers={customers}
              defaultCustomerId={customer.id}
            />
            {customer.vehicles.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center py-12">
                  <Car className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{t('noVehicles')}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Card list (phones + small tablets) */}
                <div className="space-y-2 md:hidden">
                  {customer.vehicles.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() =>
                        router.push(
                          `/vehicles/${v.id}?back=${encodeURIComponent(`/customers/${customer.id}`)}`
                        )
                      }
                      className="w-full rounded-lg border bg-card p-3 text-left active:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {v.year} {v.make} {v.model}
                        </span>
                        {v.licensePlate && (
                          <span className="shrink-0 font-mono text-sm">{v.licensePlate}</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">
                          {v.mileage.toLocaleString()} {unitSystem === 'metric' ? 'km' : 'mi'}
                        </span>
                        <span>
                          {t('vehicleTable.services')}: {v._count.serviceRecords}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Table (md and up) */}
                <div className="hidden rounded-lg border md:block" {...tableNav.containerProps}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">{t('vehicleTable.plate')}</TableHead>
                        <TableHead>{t('vehicleTable.vehicle')}</TableHead>
                        <TableHead className="hidden sm:table-cell w-[100px] text-right">
                          {serviceType === 'marine'
                            ? t('vehicleTable.mileageMarine')
                            : t('vehicleTable.mileage')}
                        </TableHead>
                        <TableHead className="w-[80px] text-center">
                          {t('vehicleTable.services')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customer.vehicles.map((v) => (
                        <TableRow
                          key={v.id}
                          className="cursor-pointer"
                          {...interactiveRow(() =>
                            router.push(
                              `/vehicles/${v.id}?back=${encodeURIComponent(`/customers/${customer.id}`)}`
                            )
                          )}
                        >
                          <TableCell className="font-mono text-sm">
                            {v.licensePlate || '-'}
                          </TableCell>
                          <TableCell className="font-medium">
                            {v.year} {v.make} {v.model}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-right font-mono text-sm">
                            {v.mileage.toLocaleString()} {unitSystem === 'metric' ? 'km' : 'mi'}
                          </TableCell>
                          <TableCell className="text-center">{v._count.serviceRecords}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'sms' && smsEnabled && (
          <Card>
            <CardContent className="p-0">
              <SmsConversation
                customerId={customer.id}
                customerName={customer.name}
                customerPhone={customer.phone}
                initialMessages={smsMessages}
                initialNextCursor={smsNextCursor}
              />
            </CardContent>
          </Card>
        )}

        {activeTab === 'whatsapp' && whatsappEnabled && (
          <Card>
            <CardContent className="p-0">
              <WhatsappConversation
                thread={{
                  key: customer.id,
                  customerId: customer.id,
                  name: customer.name,
                  phone: customer.phone ?? '',
                }}
              />
            </CardContent>
          </Card>
        )}

        {activeTab === 'telegram' && telegramEnabled && (
          <Card>
            <CardContent className="p-0">
              <TelegramConversation
                customerId={customer.id}
                customerName={customer.name}
                telegramChatId={telegramChatId}
                initialMessages={telegramMessages}
                initialNextCursor={telegramNextCursor}
              />
            </CardContent>
          </Card>
        )}

        {activeTab === 'requests' && customer.serviceRequests && (
          <div className="space-y-3">
            {customer.serviceRequests.map((req) => (
              <ServiceRequestCard
                key={req.id}
                request={req}
                smsEnabled={smsEnabled}
                customerPhone={customer.phone}
                customerName={customer.name}
                customerId={customer.id}
              />
            ))}
          </div>
        )}
      </div>
      <CustomerForm open={showEditForm} onOpenChange={setShowEditForm} customer={customer} />
    </div>
  )
}

function ServiceRequestCard({
  request,
  smsEnabled,
  customerPhone,
  customerName,
  customerId,
}: {
  request: ServiceRequestItem
  smsEnabled: boolean
  customerPhone: string | null
  customerName: string
  customerId: string
}) {
  const t = useTranslations('customers.serviceRequests')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [notes, setNotes] = useState(request.adminNotes ?? '')
  const [showNotes, setShowNotes] = useState(false)
  const [showSmsDialog, setShowSmsDialog] = useState(false)

  const statusConfig: Record<
    string,
    { label: string; variant: 'default' | 'secondary' | 'outline'; icon: React.ReactNode }
  > = {
    pending: { label: t('statusNew'), variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
    converted: {
      label: t('statusConverted'),
      variant: 'default',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    dismissed: { label: t('statusDismissed'), variant: 'outline', icon: <X className="h-3 w-3" /> },
  }

  const config = statusConfig[request.status] ?? statusConfig.pending

  const workOrderId = (() => {
    if (!request.adminNotes) return null
    const match = request.adminNotes.match(/Work Order: (\S+)/)
    return match ? match[1] : null
  })()

  const handleCreateWorkOrder = () => {
    startTransition(async () => {
      const result = await createWorkOrderFromRequest(request.id)
      if (result.success && result.data) {
        toast.success(t('workOrderCreated'))
        router.push(`/vehicles/${result.data.vehicleId}/service/${result.data.serviceRecordId}`)
      } else {
        toast.error(result.error ?? t('workOrderError'))
      }
    })
  }

  const handleDismiss = () => {
    startTransition(async () => {
      const result = await updateServiceRequest(request.id, {
        status: 'dismissed',
        adminNotes: notes || undefined,
      })
      if (result.success) {
        toast.success(t('requestDismissed'))
        router.refresh()
      } else {
        toast.error(result.error ?? t('dismissError'))
      }
    })
  }

  const handleSaveNotes = () => {
    startTransition(async () => {
      const result = await updateServiceRequest(request.id, {
        adminNotes: notes || undefined,
      })
      if (result.success) {
        toast.success(t('notesSaved'))
        router.refresh()
      } else {
        toast.error(result.error ?? t('notesSaveError'))
      }
    })
  }

  const canSms = smsEnabled && !!customerPhone
  const vehicleDisplay = `${request.vehicle.year} ${request.vehicle.make} ${request.vehicle.model}`

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{vehicleDisplay}</p>
                <Badge variant={config.variant} className="gap-1">
                  {config.icon}
                  {config.label}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                {request.description}
              </p>
              <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                <span>
                  {t('submitted', { date: new Date(request.createdAt).toLocaleDateString() })}
                </span>
                {request.preferredDate && (
                  <span>
                    {t('preferred', { date: new Date(request.preferredDate).toLocaleDateString() })}
                  </span>
                )}
              </div>
              {request.adminNotes && !showNotes && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium">{t('staffNotes')}</span> {request.adminNotes}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            {request.status === 'pending' && (
              <>
                <Button size="sm" onClick={handleCreateWorkOrder} disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="mr-1 h-3 w-3" />
                  )}
                  {t('createWorkOrder')}
                </Button>
                {canSms && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSmsDialog(true)}
                    disabled={isPending}
                  >
                    <MessageSquare className="mr-1 h-3 w-3" />
                    {t('contactCustomer')}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={handleDismiss} disabled={isPending}>
                  <X className="mr-1 h-3 w-3" />
                  {t('dismiss')}
                </Button>
              </>
            )}
            {request.status === 'converted' && workOrderId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  router.push(`/vehicles/${request.vehicle.id}/service/${workOrderId}`)
                }
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                {t('viewWorkOrder')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowNotes(!showNotes)}>
              <Pencil className="mr-1 h-3 w-3" />
              {showNotes ? t('hideNotes') : t('notes')}
            </Button>
          </div>

          {showNotes && (
            <div className="mt-3 space-y-2">
              <Textarea
                placeholder={t('notesPlaceholder')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
              <Button size="sm" onClick={handleSaveNotes} disabled={isPending}>
                {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {t('saveNotes')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canSms && (
        <SendSmsDialog
          open={showSmsDialog}
          onOpenChange={setShowSmsDialog}
          customerId={customerId}
          customerName={customerName}
          customerPhone={customerPhone!}
          entityLabel={t('smsLabel')}
          defaultMessage={t('smsDefault', { name: customerName, vehicle: vehicleDisplay })}
          relatedEntityType="service_request"
          relatedEntityId={request.id}
        />
      )}
    </>
  )
}
