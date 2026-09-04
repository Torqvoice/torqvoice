import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * QuickBooks Online: issued invoices, their customers and their payments go
 * to the ledger, and payments recorded in the ledger come back.
 *
 * Intuit's OAuth puts the client credentials in a Basic header, does not do
 * PKCE, and names the company (the "realm") only as a query parameter on the
 * callback, which is why it is listed under callbackParams. One scope covers
 * the accounting API. Which company was chosen decides every API URL, so it
 * lives on the connection's state rather than in a setting.
 */
export const manifest: ConnectorManifest = {
  id: 'quickbooks',
  name: 'QuickBooks Online',
  category: 'accounting',
  countries: 'global',
  logo: '/images/integrations/quickbooks.svg',
  docs: '/docs/integrations/quickbooks',
  auth: {
    type: 'oauth2',
    authorizeUrl: 'https://appcenter.intuit.com/connect/oauth2',
    tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    scopes: ['com.intuit.quickbooks.accounting'],
    tokenAuth: 'basic',
    callbackParams: ['realmId'],
    platformEnv: {
      clientId: 'QUICKBOOKS_INTEGRATION_CLIENT_ID',
      clientSecret: 'QUICKBOOKS_INTEGRATION_CLIENT_SECRET',
    },
    tenantFields: [
      { key: 'clientId', label: 'clientId', type: 'text', required: true },
      { key: 'clientSecret', label: 'clientSecret', type: 'password', required: true },
    ],
    tenantHelp: 'tenantHelp',
  },
  capabilities: ['accounting.invoices', 'accounting.customers', 'accounting.payments'],
  settings: [
    { key: 'pushInvoices', type: 'boolean', label: 'pushInvoices', default: true },
    {
      key: 'pushOnComplete',
      type: 'boolean',
      label: 'pushOnComplete',
      help: 'pushOnCompleteHelp',
      default: false,
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'startDate',
      type: 'text',
      label: 'startDate',
      help: 'startDateHelp',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'includeVehicle',
      type: 'boolean',
      label: 'includeVehicle',
      help: 'includeVehicleHelp',
      default: true,
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'laborItemId',
      type: 'remote-select',
      label: 'laborItemId',
      help: 'laborItemIdHelp',
      source: 'items',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'partsItemId',
      type: 'remote-select',
      label: 'partsItemId',
      help: 'partsItemIdHelp',
      source: 'items',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'taxCodeId',
      type: 'remote-select',
      label: 'taxCodeId',
      help: 'taxCodeIdHelp',
      source: 'taxCodes',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'zeroTaxCodeId',
      type: 'remote-select',
      label: 'zeroTaxCodeId',
      help: 'zeroTaxCodeIdHelp',
      source: 'taxCodes',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    { key: 'pushPayments', type: 'boolean', label: 'pushPayments', default: true },
    {
      key: 'depositAccountId',
      type: 'remote-select',
      label: 'depositAccountId',
      help: 'depositAccountIdHelp',
      source: 'depositAccounts',
      showWhen: { key: 'pushPayments', equals: true },
    },
    {
      key: 'manualPaidAsPayment',
      type: 'boolean',
      label: 'manualPaidAsPayment',
      help: 'manualPaidAsPaymentHelp',
      default: false,
      showWhen: { key: 'pushPayments', equals: true },
    },
    {
      key: 'pullPayments',
      type: 'boolean',
      label: 'pullPayments',
      help: 'pullPaymentsHelp',
      default: true,
    },
  ],
  subscriptions: [
    { event: 'service.create', job: 'accounting.invoice' },
    { event: 'service.update', job: 'accounting.invoice' },
    { event: 'service.status', job: 'accounting.invoice' },
    { event: 'service.delete', job: 'accounting.invoice' },
    { event: 'customer.update', job: 'accounting.customer' },
    { event: 'payment.create', job: 'accounting.payment' },
    { event: 'payment.delete', job: 'accounting.payment' },
  ],
  schedules: [{ job: 'accounting.pull', everyMinutes: 30 }],
}
