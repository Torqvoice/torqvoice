/**
 * The test email every mail vendor sends from its connection page.
 *
 * A key check proves the key; only a delivered message proves the from
 * address, the domain and the vendor's sending rules, which is what a
 * workshop wants to know before an invoice goes out. It goes through the
 * connection being looked at, not whichever vendor the organization is
 * pointed at, so a vendor can be tried before it takes over.
 */

import { sendMailThroughConnection } from '@/lib/email'
import type { MessagingSendTest } from './factory'

export const sendTestEmail: MessagingSendTest = async (
  { connectorId, credentials, settings },
  to
) => {
  await sendMailThroughConnection(connectorId, credentials, settings, {
    to: to.email,
    subject: 'Email Test - Torqvoice',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Email Configuration Test</h2>
        <p>This is a test email from your organization's email integration.</p>
        <p>If you're reading this, your email provider is configured correctly.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="color: #6b7280; font-size: 12px;">
          Sent to: ${to.email}<br/>
          Time: ${new Date().toISOString()}
        </p>
      </div>
    `,
  })
}
