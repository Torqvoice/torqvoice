'use server'

import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { submitFeedbackSchema } from '../Schema/statusReportSchema'

export async function submitStatusReportFeedback(input: unknown) {
  const data = submitFeedbackSchema.parse(input)

  const report = await db.statusReport.findUnique({
    where: { publicToken: data.token },
    include: {
      serviceRecord: {
        select: {
          id: true,
          title: true,
          vehicleId: true,
          customer: { select: { name: true } },
          vehicle: {
            select: {
              year: true,
              make: true,
              model: true,
              customer: { select: { name: true } },
            },
          },
        },
      },
      inspection: {
        select: {
          id: true,
          template: { select: { name: true } },
          vehicle: {
            select: {
              year: true,
              make: true,
              model: true,
              customer: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  if (!report) throw new Error('Status report not found')
  if (report.expiresAt && report.expiresAt < new Date())
    throw new Error('This status report has expired')
  if (report.customerFeedback) throw new Error('Feedback has already been submitted')

  await db.statusReport.update({
    where: { id: report.id },
    data: {
      customerFeedback: data.feedback.slice(0, 2000),
      feedbackAt: new Date(),
    },
  })

  // Notify the organization about the feedback, on whichever record the
  // report was sent from.
  const job = report.serviceRecord
  const inspection = report.inspection
  const vehicle = job?.vehicle ?? inspection?.vehicle ?? null
  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
    : (job?.title ?? inspection?.template.name ?? '')
  const customerName = (job?.customer ?? vehicle?.customer)?.name ?? 'Customer'
  const excerpt = data.feedback.length > 100 ? `${data.feedback.slice(0, 100)}...` : data.feedback

  await notify({
    organizationId: report.organizationId,
    type: 'status_report_feedback',
    title: 'New Status Report Feedback',
    message: `${customerName} responded to the status report for ${vehicleName}: "${excerpt}"`,
    ...(job
      ? {
          entityType: 'ServiceRecord',
          entityId: job.id,
          entityUrl: job.vehicleId
            ? `/vehicles/${job.vehicleId}/service/${job.id}?tab=statusReports`
            : `/sales/${job.id}?tab=statusReports`,
        }
      : {
          entityType: 'Inspection',
          entityId: inspection?.id ?? report.id,
          entityUrl: `/inspections/${inspection?.id}#inspection-files`,
        }),
  })

  return { success: true }
}
