import type { SettingsEntry } from './types'

/**
 * Email templates. The group cards and the rows inside them are drawn from
 * EMAIL_KIND_GROUPS, so there is no literal id to land on: these entries open
 * the page and let the person scroll to the group.
 */
export const emailTemplatesEntries: SettingsEntry[] = [
  {
    id: 'emailTemplates.documents',
    page: 'emailTemplates',
    title: 'emailTemplates.groups.documents',
    keywords: ['document emails', 'invoice email', 'quote email', 'email wording'],
  },
  {
    id: 'emailTemplates.invoiceSent',
    page: 'emailTemplates',
    title: 'emailTemplates.kinds.invoice_sent.name',
    description: 'emailTemplates.kinds.invoice_sent.description',
    keywords: ['invoice email', 'invoice mail', 'email template', 'invoice message'],
  },
  {
    id: 'emailTemplates.quoteSent',
    page: 'emailTemplates',
    title: 'emailTemplates.kinds.quote_sent.name',
    description: 'emailTemplates.kinds.quote_sent.description',
    keywords: ['quote email', 'estimate email', 'quote mail'],
  },
  {
    id: 'emailTemplates.inspectionSent',
    page: 'emailTemplates',
    title: 'emailTemplates.kinds.inspection_sent.name',
    description: 'emailTemplates.kinds.inspection_sent.description',
    keywords: ['inspection email', 'inspection report email', 'report mail'],
  },
  {
    id: 'emailTemplates.message',
    page: 'emailTemplates',
    title: 'emailTemplates.kinds.message.name',
    description: 'emailTemplates.kinds.message.description',
    keywords: ['customer message email', 'notification email', 'reminder email', 'status email'],
  },
  {
    id: 'emailTemplates.portalSignin',
    page: 'emailTemplates',
    title: 'emailTemplates.kinds.portal_signin.name',
    description: 'emailTemplates.kinds.portal_signin.description',
    keywords: ['portal sign-in email', 'magic link email', 'login email', 'portal email'],
  },
  {
    id: 'emailTemplates.teamInvitation',
    page: 'emailTemplates',
    title: 'emailTemplates.kinds.team_invitation.name',
    description: 'emailTemplates.kinds.team_invitation.description',
    keywords: ['invitation email', 'invite email', 'team invite', 'new user email'],
  },
]
