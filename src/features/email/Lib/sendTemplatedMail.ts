import 'server-only'

import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { db } from '@/lib/db'
import { getOrgFromAddress, type SendMailOptions, sendOrgMail } from '@/lib/email'
import { formatDate } from '@/lib/format'
import { resolveWorkshopTimeZone } from '@/lib/workshop-timezone'
import { renderEmailHtml } from '../Render/renderEmailHtml'
import { renderEmailText } from '../Render/renderEmailText'
import { buildEmailSpec } from './buildEmailSpec'
import {
  type EmailContext,
  type SummaryLabels,
  summaryRowsFor,
  tagValuesFor,
  type WorkshopContext,
} from './emailContext'
import type { EmailKind } from './emailKinds'
import { loadEmailMessages } from './emailMessages.server'
import { resolveEmailTemplate } from './resolveEmailTemplate'
import { assetUrlsFor } from './emailAssets.server'

/**
 * One door every customer-facing mail leaves through.
 *
 * Resolves the workshop's template for the kind, fills it from the context
 * the caller knows, renders both halves and sends through the workshop's
 * provider. Callers gather what they are sending about; nothing about how a
 * mail looks lives anywhere else.
 */

export interface TemplatedMailOptions<K extends EmailKind> {
  kind: K
  to: string
  context: EmailContext<K>
  /** The reader's language. Resolved from the workshop's settings when absent. */
  locale?: string
  /** Whether a PDF rides along; the attachment note appears only then. */
  attached?: boolean
  attachments?: SendMailOptions['attachments']
  replyTo?: string
  /**
   * A subject the caller insists on, in place of the template's. For a
   * status report the subject names the vehicle and is worded by the app.
   */
  subject?: string
  /** For the designer's test send: this template, not the one that is active. */
  template?: Awaited<ReturnType<typeof resolveEmailTemplate>>
}

const WORKSHOP_KEYS = [
  'workshop.phone',
  'workshop.email',
  'workshop.address',
  'workshop.dateFormat',
  'workshop.timezone',
  'workshop.timezoneDetected',
] as const

interface WorkshopMailSettings {
  workshop: WorkshopContext
  dateFormat?: string
  timezone?: string
}

async function loadWorkshop(organizationId: string): Promise<WorkshopMailSettings> {
  const [rows, org] = await Promise.all([
    db.appSetting.findMany({
      where: { organizationId, key: { in: [...WORKSHOP_KEYS] } },
      select: { key: true, value: true },
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ])
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value

  return {
    workshop: {
      name: org?.name,
      phone: settings['workshop.phone'],
      email: settings['workshop.email'],
      address: settings['workshop.address'],
    },
    dateFormat: settings['workshop.dateFormat'],
    timezone: resolveWorkshopTimeZone(
      settings['workshop.timezone'],
      settings['workshop.timezoneDetected']
    ),
  }
}

/** The mail as it would go out: subject, HTML and its plain-text half. */
export async function buildTemplatedMail<K extends EmailKind>(
  organizationId: string,
  options: TemplatedMailOptions<K>
) {
  const [locale, settings] = await Promise.all([
    options.locale ?? resolveCustomerLocale(organizationId, null),
    loadWorkshop(organizationId),
  ])
  const [template, messages] = await Promise.all([
    options.template ?? resolveEmailTemplate(organizationId, options.kind, locale),
    loadEmailMessages(locale),
  ])

  const dateOf = (date: Date) => formatDate(date, settings.dateFormat, settings.timezone)
  const labels: SummaryLabels = messages.summary

  // Every upload the template refers to, checked against the disk, as an
  // address a mail client can fetch. A file that is gone drops its block.
  const assets = await assetUrlsFor(organizationId, template)

  const spec = buildEmailSpec(template, {
    values: tagValuesFor(options.kind, options.context, {
      workshop: settings.workshop,
      formatDate: dateOf,
    }),
    summary: summaryRowsFor(options.kind, options.context, labels, dateOf),
    // A URL rather than the file inlined: Gmail and Outlook.com drop data
    // URIs, and the public route serves the upload by org and file.
    logoUrl: template.theme.logoUrl ? assets[template.theme.logoUrl] : undefined,
    assets,
    attached: options.attached ?? false,
  })

  const subject = options.subject?.trim() || spec.subject
  return { subject, html: renderEmailHtml(spec), text: renderEmailText(spec) }
}

export async function sendTemplatedMail<K extends EmailKind>(
  organizationId: string,
  options: TemplatedMailOptions<K>
): Promise<{ subject: string }> {
  const mail = await buildTemplatedMail(organizationId, options)
  await sendOrgMail(organizationId, {
    from: await getOrgFromAddress(organizationId),
    to: options.to,
    replyTo: options.replyTo,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: options.attachments,
  })
  return { subject: mail.subject }
}
