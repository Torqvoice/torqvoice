'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Paperclip } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { cn } from '@/lib/utils'
import {
  MediaGrid,
  type MediaKind,
  type MediaStore,
} from '@/features/vehicles/Components/service-page/modern/MediaGrid'
import { PhotoHandoffButton } from '@/features/vehicles/Components/service-page/PhotoHandoffButton'
import type { Attachment } from '@/features/vehicles/Components/service-page/service-page-types'
import { StatusReportList } from '@/features/status-reports/Components/StatusReportList'
import { INSPECTION_ATTACHMENT_LIMITS } from '../Lib/attachmentLimits'
import {
  addInspectionAttachment,
  deleteInspectionAttachment,
  updateInspectionAttachment,
} from '../Actions/attachmentActions'

export interface InspectionAttachmentData {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  category: string
  description: string | null
  includeInReport: boolean
  createdAt: Date
}

/** A status report as the list draws it: the same summary a job's list gets. */
export interface InspectionStatusReportData {
  id: string
  title: string | null
  message: string | null
  status: string
  videoUrl: string | null
  createdAt: string
  expiresAt: string | null
  publicToken: string
  customerFeedback: string | null
  feedbackAt: string | null
  sentVia: string | null
  sentAt: string | null
}

type Tab = 'image' | 'document' | 'video' | 'statusReports'

/** The grid speaks the work order's words; "on the invoice" here means "on the shared report". */
const asTile = (file: InspectionAttachmentData): Attachment => ({
  ...file,
  includeInInvoice: file.includeInReport,
})

/**
 * Files on the inspection as a whole: overview photos, a video of the walk
 * round, and documents such as the regulator's own form once it is signed.
 * The same tiles as the work order's files card, saved to the inspection.
 * A photo that is the evidence for one check belongs on that check instead;
 * the phone code on this card reaches both.
 *
 * Open after the inspection is completed, as the work order's files are on a
 * locked invoice: the signed form usually arrives last.
 *
 * The last tab is the video reports sent to the customer from here, the same
 * status reports a work order sends, so the desk can show what the test found
 * before anyone decides what to do about it.
 */
export function InspectionFilesCard({
  inspectionId,
  attachments,
  organizationId,
  vehicleName,
  customer,
  smsEnabled,
  emailEnabled,
  telegramEnabled,
  statusReports,
}: {
  inspectionId: string
  attachments: InspectionAttachmentData[]
  organizationId: string
  vehicleName: string
  customer: {
    id: string
    name: string
    email: string | null
    phone: string | null
    telegramChatId: string | null
  } | null
  smsEnabled: boolean
  emailEnabled: boolean
  telegramEnabled: boolean
  statusReports: InspectionStatusReportData[]
}) {
  const t = useTranslations('inspections.files')
  const tReports = useTranslations('statusReport.list')
  const [tab, setTab] = useState<Tab>('image')

  const store = useMemo<MediaStore>(
    () => ({
      add: async (file) => {
        const result = await addInspectionAttachment({
          inspectionId,
          attachment: {
            fileName: file.fileName,
            fileUrl: file.fileUrl,
            fileType: file.fileType,
            fileSize: file.fileSize,
            category: file.category,
            // Paperwork waits until the workshop chooses to show it.
            includeInReport: file.category === 'document' ? false : file.includeInInvoice,
          },
        })
        return result.success && result.data
          ? { success: true, data: asTile(result.data as InspectionAttachmentData) }
          : { success: false, error: result.error }
      },
      update: ({ id, includeInInvoice, description }) =>
        updateInspectionAttachment({ id, includeInReport: includeInInvoice, description }),
      remove: (id) => deleteInspectionAttachment(id),
    }),
    [inspectionId]
  )

  const byKind = (kind: MediaKind) =>
    attachments.filter((file) => file.category === kind).map(asTile)
  const tabs: { value: Tab; label: string; count: number; max?: number }[] = [
    {
      value: 'image',
      label: t('photos'),
      count: byKind('image').length,
      max: INSPECTION_ATTACHMENT_LIMITS.image,
    },
    {
      value: 'document',
      label: t('documents'),
      count: byKind('document').length,
      max: INSPECTION_ATTACHMENT_LIMITS.document,
    },
    {
      value: 'video',
      label: t('video'),
      count: byKind('video').length,
      max: INSPECTION_ATTACHMENT_LIMITS.video,
    },
    { value: 'statusReports', label: tReports('title'), count: statusReports.length },
  ]
  const max = tabs.find((item) => item.value === tab)?.max

  return (
    <div
      id="inspection-files"
      data-testid="inspection-files"
      className="scroll-mt-36"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault()
          e.target.blur()
        }
      }}
    >
      <AppCard
        icon={Paperclip}
        title={t('title')}
        action={<PhotoHandoffButton inspectionId={inspectionId} />}
        contentClassName="p-0"
      >
        <p className="px-5 pt-3 text-[13px] text-muted-foreground">{t('hint')}</p>
        <div
          role="tablist"
          aria-label={t('title')}
          className="flex gap-1 overflow-x-auto border-b border-card-edge px-5 scrollbar-none"
        >
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => setTab(item.value)}
              className={cn(
                '-mb-px flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors',
                tab === item.value
                  ? 'border-primary font-semibold text-foreground'
                  : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
              <span className="rounded bg-muted px-1.5 text-[11px] tabular-nums text-foreground">
                {item.count}
              </span>
            </button>
          ))}
        </div>
        <div role="tabpanel" className="@container">
          {tab === 'statusReports' ? (
            <div className="p-5">
              <StatusReportList
                inspectionId={inspectionId}
                organizationId={organizationId}
                vehicleName={vehicleName}
                customer={customer}
                smsEnabled={smsEnabled}
                emailEnabled={emailEnabled}
                telegramEnabled={telegramEnabled}
                initialReports={statusReports}
              />
            </div>
          ) : (
            <MediaGrid
              key={tab}
              kind={tab}
              serviceRecordId=""
              store={store}
              files={byKind(tab)}
              max={max}
            />
          )}
        </div>
      </AppCard>
    </div>
  )
}
