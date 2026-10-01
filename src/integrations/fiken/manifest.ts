import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Fiken: issued invoices, their customers and their payments go to the
 * books, and payments recorded in Fiken come back.
 *
 * Fiken numbers every invoice it issues itself, so an invoice written here
 * goes in as a sale ("Annet salg") of the kind Fiken keeps for invoices made
 * elsewhere, under its own number, with the document attached.
 *
 * The OAuth app has no scopes, takes the client credentials in a Basic
 * header and wants the state repeated on the code exchange. One Fiken user
 * can hold several companies and the callback names none, so which company
 * to write to is the first setting.
 */
export const manifest: ConnectorManifest = {
  id: 'fiken',
  name: 'Fiken',
  category: 'accounting',
  countries: ['NO'],
  logo: '/images/integrations/fiken.svg',
  docs: '/docs/integrations/fiken',
  auth: {
    type: 'oauth2',
    authorizeUrl: 'https://fiken.no/oauth/authorize',
    tokenUrl: 'https://fiken.no/oauth/token',
    scopes: [],
    tokenAuth: 'basic',
    stateOnExchange: true,
    platformEnv: {
      clientId: 'FIKEN_INTEGRATION_CLIENT_ID',
      clientSecret: 'FIKEN_INTEGRATION_CLIENT_SECRET',
    },
    tenantFields: [
      { key: 'clientId', label: 'clientId', type: 'text', required: true },
      { key: 'clientSecret', label: 'clientSecret', type: 'password', required: true },
    ],
    tenantHelp: 'tenantHelp',
  },
  capabilities: ['accounting.invoices', 'accounting.customers', 'accounting.payments'],
  settings: [
    {
      key: 'companySlug',
      type: 'remote-select',
      label: 'companySlug',
      help: 'companySlugHelp',
      source: 'companies',
      required: true,
    },
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
      type: 'date',
      label: 'startDate',
      help: 'startDateHelp',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'attachPdf',
      type: 'boolean',
      label: 'attachPdf',
      help: 'attachPdfHelp',
      default: true,
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'laborAccount',
      type: 'remote-select',
      label: 'laborAccount',
      help: 'laborAccountHelp',
      source: 'incomeAccounts',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'partsAccount',
      type: 'remote-select',
      label: 'partsAccount',
      help: 'partsAccountHelp',
      source: 'incomeAccounts',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'zeroVatType',
      type: 'select',
      label: 'zeroVatType',
      help: 'zeroVatTypeHelp',
      options: [
        { value: 'NONE', label: 'vatNone' },
        { value: 'EXEMPT', label: 'vatExempt' },
        { value: 'OUTSIDE', label: 'vatOutside' },
        { value: 'EXEMPT_IMPORT_EXPORT', label: 'vatExport' },
        { value: 'EXEMPT_REVERSE', label: 'vatReverse' },
      ],
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'zeroAccount',
      type: 'remote-select',
      label: 'zeroAccount',
      help: 'zeroAccountHelp',
      source: 'incomeAccounts',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    { key: 'pushPayments', type: 'boolean', label: 'pushPayments', default: true },
    {
      key: 'paymentAccount',
      type: 'remote-select',
      label: 'paymentAccount',
      help: 'paymentAccountHelp',
      source: 'paymentAccounts',
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
