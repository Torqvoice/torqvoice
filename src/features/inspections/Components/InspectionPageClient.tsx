'use client'

import { type ComponentProps, type ComponentType, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useFormatDate } from '@/lib/use-format-date'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  MessageSquareText,
  MoreVertical,
  RotateCcw,
  Save,
  Settings2,
  Wrench,
  Share2,
  Trash2,
  Eye,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  completeInspection,
  deleteInspection,
  reopenInspection,
  createQuoteFromInspection,
} from '../Actions/inspectionActions'
import { InspectionShareDialog } from './InspectionShareDialog'
import { InspectionNotesCard } from './InspectionNotesCard'
import { PdfPreviewDialog } from '@/components/pdf-preview-dialog'
import { WorkOrderFromInspectionDialog } from './WorkOrderFromInspectionDialog'
import { cn } from '@/lib/utils'
import {
  InspectionFilesCard,
  type InspectionAttachmentData,
  type InspectionStatusReportData,
} from './InspectionFilesCard'
import { InspectionCertificateCard, type TechnicianOption } from './InspectionCertificateCard'
import { InspectionItemRow, type InspectionItemData } from './InspectionItemRow'
import { MediaLightbox, type LightboxImage } from './MediaLightbox'
import { useServiceType } from '@/components/service-type-context'
import {
  CONDITION_TOKENS,
  TEST_RESULT_TOKENS,
  countConditions,
  deriveTestResult,
  isDefect,
  worstCondition,
  type Condition,
  type SeverityScale,
} from '../Lib/conditions'
import { useConditionLabels } from '../Lib/useConditionLabels'
import { describeBlocker, findCompletionBlockers } from '../Lib/completion'

export interface InspectionData {
  id: string
  status: string
  mileage: number | null
  notes: string | null
  publicToken: string | null
  completedAt: Date | null
  createdAt: Date
  organizationId: string
  severityScale: string | null
  country: string | null
  vehicleCategory: string | null
  nextTestDue: Date | null
  certificateNumber: string | null
  technicianId: string | null
  inspectorName: string | null
  testLocation: string | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    vin: string | null
    licensePlate: string | null
    mileage: number
    customer: {
      id: string
      name: string
      email: string | null
      phone: string | null
      telegramChatId?: string | null
    } | null
  }
  template: {
    id: string
    name: string
    severityScale?: string | null
    country?: string | null
    standard?: string | null
  }
  technician?: { id: string; name: string } | null
  items: InspectionItemData[]
  attachments?: InspectionAttachmentData[]
  quotes: {
    id: string
    quoteNumber: string | null
    status: string
    createdAt: Date
    user: { name: string }
  }[]
  quoteRequests: {
    id: string
    message: string | null
    selectedItemIds: string[]
    createdAt: Date
  }[]
  serviceRecords: {
    id: string
    title: string
    status: string
    invoiceNumber: string | null
    createdAt: Date
  }[]
}

const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url)

/** Segmented bar showing how the checks are distributed across the grades. */
function ProgressRail({
  counts,
  label,
}: {
  counts: ReturnType<typeof countConditions>
  label: string
}) {
  const segments = (
    [
      ['pass', counts.pass],
      ['attention', counts.attention],
      ['fail', counts.fail],
      ['dangerous', counts.dangerous],
      ['not_applicable', counts.notApplicable],
    ] as const
  )
    .map(([key, value]) => ({ key, value }))
    .filter((s) => s.value > 0)

  return (
    <div
      className="bg-muted flex h-2.5 w-full overflow-hidden rounded-full"
      role="img"
      aria-label={label}
    >
      {segments.map((segment) => (
        <div
          key={segment.key}
          className={CONDITION_TOKENS[segment.key].bar}
          style={{ width: `${(segment.value / Math.max(counts.total, 1)) * 100}%` }}
        />
      ))}
    </div>
  )
}

/**
 * The thin rule under a section header: how much of the section is graded,
 * in the grades' own colours, the rest left as the muted track.
 */
function SectionRule({ counts }: { counts: ReturnType<typeof countConditions> }) {
  const segments = (
    [
      ['pass', counts.pass],
      ['attention', counts.attention],
      ['fail', counts.fail],
      ['dangerous', counts.dangerous],
      ['not_applicable', counts.notApplicable],
    ] as const
  ).filter(([, value]) => value > 0)
  return (
    <div className="bg-muted flex h-0.5 w-full overflow-hidden" aria-hidden="true">
      {segments.map(([key, value]) => (
        <div
          key={key}
          className={CONDITION_TOKENS[key].bar}
          style={{ width: `${(value / Math.max(counts.total, 1)) * 100}%` }}
        />
      ))}
    </div>
  )
}

function CountChip({
  condition,
  value,
  label,
}: {
  condition: Condition
  value: number
  label: string
}) {
  const token = CONDITION_TOKENS[condition]
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${token.bar}`} aria-hidden="true" />
      <span className="text-xs">
        <span className="font-semibold">{value}</span>{' '}
        <span className="text-muted-foreground">{label}</span>
      </span>
    </div>
  )
}

export function InspectionPageClient({
  inspection,
  organizationId,
  smsEnabled = false,
  emailEnabled = false,
  telegramEnabled = false,
  statusReports = [],
  defectHistory = {},
  technicians = [],
  workshopAddress = '',
}: {
  inspection: InspectionData
  /** For the share links of the inspection's status reports. */
  organizationId: string
  smsEnabled?: boolean
  emailEnabled?: boolean
  telegramEnabled?: boolean
  /** Video reports sent to the customer from this inspection. */
  statusReports?: InspectionStatusReportData[]
  /** Wording this workshop has used before, keyed by check name. */
  defectHistory?: Record<string, { text: string; severity: string }[]>
  technicians?: TechnicianOption[]
  workshopAddress?: string
}) {
  const t = useTranslations('inspections.page')
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const serviceType = useServiceType()
  const [isPending, startTransition] = useTransition()
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [showReopenDialog, setShowReopenDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [isCreatingQuote, setIsCreatingQuote] = useState(false)
  const [isCreatingWorkOrder, setIsCreatingWorkOrder] = useState(false)
  const [showWorkOrderDialog, setShowWorkOrderDialog] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // The checklist saves each check as it is graded, which is only reassuring if
  // the page says so. Without this the technician has no way to tell a saved
  // inspection from one that silently failed halfway down a long Annex I sheet.
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  // Grades and photo counts are mirrored here so the summary, the section nav
  // and the complete dialog react the moment a check is saved, instead of
  // waiting for a refresh. Photo counts matter as much as grades: a check that
  // requires evidence blocks completion until it has some.
  const [grades, setGrades] = useState<Record<string, Condition>>(() =>
    Object.fromEntries(inspection.items.map((i) => [i.id, i.condition as Condition]))
  )
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(inspection.items.map((i) => [i.id, (i.imageUrls ?? []).length]))
  )

  const isCompleted = inspection.status === 'completed'
  // The snapshot wins; the template is the fallback for inspections that
  // predate it, and the migration pinned those templates to their old scale.
  const storedScale = inspection.severityScale ?? inspection.template.severityScale
  const scale: SeverityScale = storedScale === 'basic' ? 'basic' : 'eu'
  const country = inspection.country ?? inspection.template.country ?? null
  const {
    label: gradeLabel,
    graded,
    result: resultLabel,
    resultDetail,
  } = useConditionLabels(scale, country)
  const mileageLabel = serviceType === 'marine' ? t('engineHours') : t('odometer')

  const sections = useMemo(() => {
    const sorted = [...inspection.items].sort((a, b) => a.sortOrder - b.sortOrder)
    const order: string[] = []
    const grouped: Record<string, InspectionItemData[]> = {}
    for (const item of sorted) {
      if (!grouped[item.section]) {
        grouped[item.section] = []
        order.push(item.section)
      }
      grouped[item.section].push(item)
    }
    return order.map((name) => ({
      name,
      code: grouped[name][0]?.sectionCode ?? null,
      items: grouped[name],
    }))
  }, [inspection.items])

  const gradedItems = useMemo(
    () => inspection.items.map((i) => ({ condition: grades[i.id] ?? i.condition })),
    [inspection.items, grades]
  )

  const counts = useMemo(() => countConditions(gradedItems), [gradedItems])
  const result = useMemo(
    () => deriveTestResult(gradedItems, { requireAllInspected: !isCompleted }),
    [gradedItems, isCompleted]
  )
  const resultToken = TEST_RESULT_TOKENS[result]

  const images = useMemo<LightboxImage[]>(() => {
    const list: LightboxImage[] = []
    for (const item of inspection.items) {
      for (const url of item.imageUrls ?? []) {
        if (!isVideo(url)) list.push({ url, caption: item.name })
      }
    }
    return list
  }, [inspection.items])

  const defectItems = inspection.items.filter((i) => isDefect(grades[i.id] ?? i.condition))
  const blockers = useMemo(
    () =>
      findCompletionBlockers(
        inspection.items.map((item) => ({
          id: item.id,
          name: item.name,
          code: item.code,
          condition: grades[item.id] ?? item.condition,
          required: item.required,
          photoRequired: item.photoRequired,
          photoCount: photoCounts[item.id] ?? (item.imageUrls ?? []).length,
        }))
      ),
    [inspection.items, grades, photoCounts]
  )
  const pendingQuoteRequest = inspection.quoteRequests?.[0] ?? null
  const workOrder = inspection.serviceRecords?.[0] ?? null
  const notInspected = counts.total - counts.inspected

  const handleSaveState = (itemId: string, state: 'saving' | 'saved' | 'error') => {
    setSavingIds((prev) => {
      const next = new Set(prev)
      if (state === 'saving') next.add(itemId)
      else next.delete(itemId)
      return next
    })
    if (state === 'saved') {
      setLastSavedAt(new Date())
      setSaveFailed(false)
    }
    if (state === 'error') setSaveFailed(true)
  }

  /**
   * Fields commit on blur, so a note still being typed has not reached the
   * server yet. Taking focus off it is what actually saves; the button exists
   * because "it saves as you go" is not something a technician should have to
   * take on trust.
   */
  const handleSaveNow = () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    if (savingIds.size === 0 && !saveFailed) {
      toast.success(t('allSaved'))
    }
  }

  const openImage = (url: string) => {
    const index = images.findIndex((img) => img.url === url)
    setLightboxIndex(index >= 0 ? index : null)
  }

  /**
   * The quote is built on the server from what the database holds: the
   * inspection line, then every check that was not OK with the note as it
   * was saved, not as this page last saw it.
   */
  const handleCreateQuoteFromInspection = async () => {
    setIsCreatingQuote(true)
    const created = await createQuoteFromInspection(inspection.id)
    if (created.success && created.data) {
      router.push(`/quotes/${created.data.id}`)
    } else {
      toast.error(created.error || t('quoteFailed'))
      setIsCreatingQuote(false)
    }
  }

  const handleComplete = () => {
    startTransition(async () => {
      const done = await completeInspection(inspection.id)
      if (done.success) {
        toast.success(t('completed'))
        setShowCompleteDialog(false)
        setShowShareDialog(true)
        router.refresh()
      } else {
        toast.error(done.error || t('completeFailed'))
      }
    })
  }

  const handleReopen = () => {
    startTransition(async () => {
      const reopened = await reopenInspection(inspection.id)
      if (reopened.success) {
        toast.success(t('reopened'))
        setShowReopenDialog(false)
        router.refresh()
      } else {
        toast.error(reopened.error || t('reopenFailed'))
      }
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      const removed = await deleteInspection(inspection.id)
      if (removed.success) {
        toast.success(t('deleted'))
        router.push('/inspections')
      } else {
        toast.error(removed.error || t('deleteFailed'))
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-16 z-20 -mx-4 border-b px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/inspections"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-9 items-center gap-1.5 rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('back')}</span>
            </Link>
            <div className="bg-border h-5 w-px" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="truncate text-base leading-tight font-semibold">
                {inspection.vehicle.year} {inspection.vehicle.make} {inspection.vehicle.model}
              </h1>
              <p className="text-muted-foreground truncate text-xs">
                {inspection.template.name} &middot; {formatDate(new Date(inspection.createdAt))}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                isCompleted
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
              }
            >
              {isCompleted ? t('statusCompleted') : t('statusInProgress')}
            </Badge>
            {!isCompleted && (
              <div className="mr-1 flex items-center gap-2">
                <p className="text-muted-foreground hidden text-xs sm:block" role="status">
                  {savingIds.size > 0
                    ? t('saving')
                    : saveFailed
                      ? t('saveFailed')
                      : lastSavedAt
                        ? t('savedAt', {
                            time: lastSavedAt.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                          })
                        : t('savesAsYouGo')}
                </p>
                <BarButton
                  variant="outline"
                  icon={savingIds.size > 0 ? Loader2 : Save}
                  spinning={savingIds.size > 0}
                  label={t('save')}
                  onClick={handleSaveNow}
                  disabled={savingIds.size > 0}
                />
              </div>
            )}
            {isCompleted ? (
              <BarButton
                variant="outline"
                icon={RotateCcw}
                label={t('reopen')}
                onClick={() => setShowReopenDialog(true)}
              />
            ) : (
              <BarButton
                icon={CheckCircle2}
                label={t('complete')}
                onClick={() => setShowCompleteDialog(true)}
              />
            )}
            {/* The certificate as the customer will get it, without leaving the page. */}
            <BarButton
              variant="outline"
              icon={Eye}
              label={t('preview')}
              onClick={() => setShowPreview(true)}
              data-testid="inspection-preview"
            />
            <BarButton
              variant="outline"
              icon={Share2}
              label={t('share')}
              onClick={() => setShowShareDialog(true)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label={t('moreActions')}
                >
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem
                  onClick={() =>
                    window.open(`/api/protected/inspections/${inspection.id}/pdf`, '_blank')
                  }
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t('downloadCertificate')}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/templates?tab=inspections">
                    <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t('manageTemplates')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_19rem] lg:items-start">
        {/* Main column */}
        <main className="min-w-0 space-y-5">
          {/* Overall result */}
          <section
            aria-labelledby="inspection-result"
            className={`rounded-lg border p-4 ${resultToken.soft}`}
          >
            <h2 id="inspection-result" className="text-base font-semibold">
              {resultLabel(result)}
            </h2>
            <p className="mt-1 text-sm">{resultDetail(result)}</p>
            {result === 'incomplete' && notInspected > 0 && (
              <p className="mt-1 text-sm">
                {t('stillToGrade', { count: notInspected, total: counts.total })}
              </p>
            )}
          </section>

          <InspectionCertificateCard
            inspection={inspection}
            technicians={technicians}
            workshopAddress={workshopAddress}
            mileageLabel={mileageLabel}
            isCompleted={isCompleted}
          />

          {/* Checks: one card per section, drawn like a stamped page of the
              paper form. The name is set in the display face, the section
              code is printed large and faint at the right like a stamp, and
              a thin rule under the header shows how much is graded and in
              which grades. */}
          {sections.map((section, index) => {
            const sectionCounts = countConditions(
              section.items.map((i) => ({ condition: grades[i.id] ?? i.condition }))
            )
            const worst = worstCondition(section.items.map((i) => grades[i.id] ?? i.condition))
            const clean = sectionCounts.notInspected === 0 && !isDefect(worst)
            const rawCode = section.code ?? String(index + 1)
            const stamp = /^\d+$/.test(rawCode) ? rawCode.padStart(2, '0') : rawCode
            return (
              <section
                key={section.name}
                id={`section-${index}`}
                aria-labelledby={`section-${index}-heading`}
                className="bg-card scroll-mt-36 overflow-hidden rounded-lg border"
              >
                <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
                  <h2
                    id={`section-${index}-heading`}
                    className="font-display min-w-0 truncate text-lg font-semibold tracking-wide uppercase"
                  >
                    {section.name}
                  </h2>
                  <div className="flex shrink-0 items-center gap-3">
                    {isDefect(worst) && (
                      <Badge variant="outline" className={CONDITION_TOKENS[worst].soft}>
                        {graded(worst)}
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {t('graded', { graded: sectionCounts.inspected, total: sectionCounts.total })}
                    </span>
                    <span
                      className={cn(
                        'font-display select-none text-3xl leading-none font-bold tracking-wide',
                        clean
                          ? 'text-emerald-600/45 dark:text-emerald-400/45'
                          : 'text-foreground/15'
                      )}
                      aria-hidden="true"
                    >
                      {stamp}
                    </span>
                  </div>
                </header>
                <SectionRule counts={sectionCounts} />
                <ul className="space-y-2 p-3">
                  {section.items.map((item) => (
                    <InspectionItemRow
                      key={item.id}
                      item={item}
                      inspectionId={inspection.id}
                      scale={scale}
                      country={country}
                      isCompleted={isCompleted}
                      history={defectHistory[item.name]}
                      onOpenImage={openImage}
                      onSaveState={handleSaveState}
                      onChanged={(itemId, change) => {
                        setGrades((prev) => ({ ...prev, [itemId]: change.condition }))
                        setPhotoCounts((prev) => ({ ...prev, [itemId]: change.photoCount }))
                      }}
                    />
                  ))}
                </ul>
              </section>
            )
          })}

          <InspectionFilesCard
            inspectionId={inspection.id}
            attachments={inspection.attachments ?? []}
            organizationId={organizationId}
            vehicleName={`${inspection.vehicle.year} ${inspection.vehicle.make} ${inspection.vehicle.model}`}
            customer={
              inspection.vehicle.customer
                ? {
                    id: inspection.vehicle.customer.id,
                    name: inspection.vehicle.customer.name,
                    email: inspection.vehicle.customer.email,
                    phone: inspection.vehicle.customer.phone,
                    telegramChatId: inspection.vehicle.customer.telegramChatId ?? null,
                  }
                : null
            }
            smsEnabled={smsEnabled}
            emailEnabled={emailEnabled}
            telegramEnabled={telegramEnabled}
            statusReports={statusReports}
          />
        </main>

        {/* Sidebar */}
        {/* Sticky, and no taller than what is left of the viewport under the
            action bar: a sidebar taller than the screen used to pin its top
            and hide its bottom until the checklist had scrolled all the way
            down. Scrolling over it now scrolls it, and the page after it. */}
        <aside className="space-y-4 lg:sticky lg:top-36 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:overscroll-y-contain lg:pr-1">
          {/* What happens with what was found: a job for the board, or a
              price for the customer first. Once one exists it is linked here. */}
          <section aria-labelledby="inspection-next-step" className="bg-card rounded-lg border p-4">
            <h2 id="inspection-next-step" className="text-sm font-semibold">
              {t('nextStep')}
            </h2>
            <div className="mt-3 space-y-2">
              {workOrder ? (
                <NextStepRow
                  icon={Wrench}
                  text={t('workOrderRaised', {
                    number: workOrder.invoiceNumber ?? '',
                    date: formatDate(new Date(workOrder.createdAt)),
                  })}
                  action={t('viewWorkOrder')}
                  tone="done"
                  onAction={() =>
                    router.push(`/vehicles/${inspection.vehicle.id}/service/${workOrder.id}`)
                  }
                  testId="next-step-work-order"
                />
              ) : (
                <NextStepRow
                  icon={Wrench}
                  text={t('nextStepWorkOrderHint')}
                  action={t('createWorkOrder')}
                  busy={isCreatingWorkOrder}
                  onAction={() => setShowWorkOrderDialog(true)}
                  testId="next-step-work-order"
                />
              )}
              {inspection.quotes.length > 0 ? (
                <NextStepRow
                  icon={FileText}
                  text={t('quoteCreated', {
                    name: inspection.quotes[0].user.name,
                    date: formatDate(new Date(inspection.quotes[0].createdAt)),
                  })}
                  action={t('viewQuote')}
                  tone="done"
                  onAction={() => router.push(`/quotes/${inspection.quotes[0].id}`)}
                  testId="next-step-quote"
                />
              ) : (
                <NextStepRow
                  icon={pendingQuoteRequest ? MessageSquareText : FileText}
                  tone={pendingQuoteRequest ? 'attention' : undefined}
                  text={
                    pendingQuoteRequest
                      ? t('quoteRequested', { count: pendingQuoteRequest.selectedItemIds.length })
                      : t('nextStepQuoteHint')
                  }
                  detail={pendingQuoteRequest?.message ?? undefined}
                  action={t('createQuote')}
                  busy={isCreatingQuote}
                  onAction={handleCreateQuoteFromInspection}
                  testId="next-step-quote"
                />
              )}
            </div>
          </section>
          <section aria-labelledby="inspection-progress" className="bg-card rounded-lg border p-4">
            <h2 id="inspection-progress" className="text-sm font-semibold">
              {t('progress')}
            </h2>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {counts.inspected}
              <span className="text-muted-foreground text-base font-normal">/{counts.total}</span>
            </p>
            <p className="text-muted-foreground text-xs">{t('checksGraded')}</p>
            <div className="mt-3">
              <ProgressRail
                counts={counts}
                label={t('progressLabel', {
                  graded: counts.inspected,
                  total: counts.total,
                  pass: counts.pass,
                  attention: counts.attention,
                  fail: counts.fail,
                  dangerous: counts.dangerous,
                })}
              />
            </div>
            <div className="mt-3 grid gap-1.5">
              <CountChip condition="pass" value={counts.pass} label={gradeLabel('pass')} />
              <CountChip
                condition="attention"
                value={counts.attention}
                label={gradeLabel('attention')}
              />
              <CountChip condition="fail" value={counts.fail} label={gradeLabel('fail')} />
              {counts.notApplicable > 0 && (
                <CountChip
                  condition="not_applicable"
                  value={counts.notApplicable}
                  label={gradeLabel('not_applicable')}
                />
              )}
              {scale === 'eu' && (
                <CountChip
                  condition="dangerous"
                  value={counts.dangerous}
                  label={gradeLabel('dangerous')}
                />
              )}
            </div>
          </section>

          <InspectionNotesCard
            inspectionId={inspection.id}
            notes={inspection.notes}
            disabled={isCompleted}
          />

          <nav aria-labelledby="inspection-sections" className="bg-card rounded-lg border p-4">
            <h2 id="inspection-sections" className="text-sm font-semibold">
              {t('sections')}
            </h2>
            <ul className="mt-2 space-y-0.5">
              {sections.map((section, index) => {
                const sectionCounts = countConditions(
                  section.items.map((i) => ({ condition: grades[i.id] ?? i.condition }))
                )
                const worst = worstCondition(section.items.map((i) => grades[i.id] ?? i.condition))
                return (
                  <li key={section.name}>
                    <a
                      href={`#section-${index}`}
                      className="hover:bg-muted focus-visible:ring-ring flex items-center gap-2 rounded-md px-2 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${CONDITION_TOKENS[worst].bar}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{section.name}</span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {sectionCounts.inspected}/{sectionCounts.total}
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>

          <section aria-labelledby="inspection-vehicle" className="bg-card rounded-lg border p-4">
            <h2 id="inspection-vehicle" className="text-sm font-semibold">
              {t('vehicle')}
            </h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">
                  {serviceType === 'marine' ? t('vessel') : t('vehicle')}
                </dt>
                <dd>
                  {inspection.vehicle.year} {inspection.vehicle.make} {inspection.vehicle.model}
                </dd>
              </div>
              {inspection.vehicle.vin && (
                <div>
                  <dt className="text-muted-foreground text-xs">
                    {serviceType === 'marine' ? 'HIN' : 'VIN'}
                  </dt>
                  <dd className="font-mono text-xs break-all">{inspection.vehicle.vin}</dd>
                </div>
              )}
              {inspection.vehicle.licensePlate && (
                <div>
                  <dt className="text-muted-foreground text-xs">
                    {serviceType === 'marine' ? t('registration') : t('plate')}
                  </dt>
                  <dd className="font-mono">{inspection.vehicle.licensePlate}</dd>
                </div>
              )}
              {inspection.vehicle.customer && (
                <div>
                  <dt className="text-muted-foreground text-xs">{t('customer')}</dt>
                  <dd>
                    <Link
                      href={`/customers/${inspection.vehicle.customer.id}`}
                      className="hover:underline"
                    >
                      {inspection.vehicle.customer.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section aria-labelledby="inspection-template" className="bg-card rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="inspection-template" className="text-sm font-semibold">
                {t('template')}
              </h2>
              <a
                href="https://torqvoice.com/docs/features/inspections"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring shrink-0 rounded text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {t('readMore')} →
              </a>
            </div>
            <p className="mt-1 text-sm">{inspection.template.name}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {scale === 'eu' ? t('scaleEu') : t('scaleBasic')}
              {country ? ` ${t('country', { code: country })}` : ''}
            </p>
            <Link
              href="/settings/templates?tab=inspections"
              className="text-primary focus-visible:ring-ring mt-3 inline-flex items-center gap-1.5 rounded-md text-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('manageInspectionTemplates')}
            </Link>
          </section>
        </aside>
      </div>

      <PdfPreviewDialog
        open={showPreview}
        onOpenChange={setShowPreview}
        url={`/api/protected/inspections/${inspection.id}/pdf`}
      />

      {/* Work order: a new job or an open one, and whether the defects come along */}
      <WorkOrderFromInspectionDialog
        open={showWorkOrderDialog}
        onOpenChange={setShowWorkOrderDialog}
        inspectionId={inspection.id}
        defects={defectItems.map((item) => ({
          id: item.id,
          name: item.name,
          condition: grades[item.id] ?? item.condition,
          sortOrder: item.sortOrder,
        }))}
        onDone={(job) => {
          setIsCreatingWorkOrder(true)
          router.push(`/vehicles/${job.vehicleId}/service/${job.id}`)
        }}
      />

      {/* Complete confirmation */}
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('completeTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {blockers.length > 0 ? (
                  <>
                    <p className="text-destructive font-medium">
                      {t('completeBlocked', { count: blockers.length })}
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {blockers.slice(0, 8).map((blocker) => (
                        <li key={blocker.id}>
                          {blocker.label} — {describeBlocker(blocker.reason)}
                        </li>
                      ))}
                    </ul>
                    {blockers.length > 8 && <p>and {blockers.length - 8} more.</p>}
                  </>
                ) : null}
                <p>{t('completeBody', { result: resultLabel(deriveTestResult(gradedItems)) })}</p>
                {notInspected > 0 && (
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    {t('completeUngraded', { count: notInspected })}
                  </p>
                )}
                {counts.dangerous > 0 && (
                  <p className="text-destructive font-medium">
                    {t('completeDangerous', { count: counts.dangerous })}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete} disabled={isPending || blockers.length > 0}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('complete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen confirmation */}
      <AlertDialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('reopenTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{t('reopenBody')}</p>
                {inspection.publicToken && <p>{t('reopenShared')}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReopen} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('reopen')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InspectionShareDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        inspectionId={inspection.id}
        organizationId={inspection.organizationId}
        publicToken={inspection.publicToken}
        customer={inspection.vehicle.customer}
        smsEnabled={smsEnabled}
        emailEnabled={emailEnabled}
      />

      <MediaLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </div>
  )
}

/**
 * One action in the bar. On a phone or a tablet the bar is icons, each with
 * its name as the accessible label and tooltip; from a laptop up the label
 * is drawn beside the icon. Same name either way, so tests and screen
 * readers find "Complete" whatever the width.
 */
function BarButton({
  icon: Icon,
  label,
  spinning = false,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  label: string
  spinning?: boolean
}) {
  return (
    <Button
      size="sm"
      aria-label={label}
      title={label}
      className={cn('px-2.5 lg:px-3', className)}
      {...props}
    >
      <Icon className={cn('h-4 w-4 lg:mr-1', spinning && 'animate-spin')} aria-hidden="true" />
      <span className="hidden lg:inline">{label}</span>
    </Button>
  )
}

/**
 * One tile of the next-step card. The whole tile is the button: the action
 * is its heading, the reason sits under it, and a chevron says it goes
 * somewhere. Once the thing exists the tile turns green and reads as a link
 * to it; a customer's pending quote request turns it amber.
 */
function NextStepRow({
  icon: Icon,
  text,
  detail,
  action,
  onAction,
  busy = false,
  tone,
  testId,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  text: string
  detail?: string
  action: string
  onAction: () => void
  busy?: boolean
  tone?: 'done' | 'attention'
  testId: string
}) {
  const tile =
    tone === 'done'
      ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
      : tone === 'attention'
        ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
        : 'border-border bg-background hover:bg-muted/60'
  const bubble =
    tone === 'done'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : tone === 'attention'
        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
        : 'bg-primary/10 text-primary'
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onAction}
      data-testid={testId}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-70',
        tile
      )}
    >
      <span
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', bubble)}
        aria-hidden="true"
      >
        {tone === 'done' ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{action}</span>
        <span className="text-muted-foreground block text-xs leading-snug">{text}</span>
        {detail && (
          <span className="text-muted-foreground mt-1 block truncate text-xs italic">
            &ldquo;{detail}&rdquo;
          </span>
        )}
      </span>
      {busy ? (
        <Loader2
          className="text-muted-foreground h-4 w-4 shrink-0 animate-spin"
          aria-hidden="true"
        />
      ) : (
        <ChevronRight
          className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      )}
    </button>
  )
}
