import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Xero: issued invoices, their customers and their payments go to the books,
 * and payments recorded in Xero come back.
 *
 * One consent can connect several Xero organisations, and every API call
 * names the one it is for, so which organisation to write to is the first
 * setting (picked by itself when only one was connected). Everything else a
 * bookkeeper decides lives in the settings: the status and number an invoice
 * gets, its reference, branding and tracking, the account and tax rate for
 * each kind of line, whether Xero or Torqvoice sends it to the customer, and
 * which bank or clearing account each kind of payment lands in.
 *
 * Apps created since 2 March 2026 get granular scopes only; offline_access
 * is what yields a refresh token.
 */
export const manifest: ConnectorManifest = {
  id: 'xero',
  name: 'Xero',
  category: 'accounting',
  countries: 'global',
  logo: '/images/integrations/xero.svg',
  docs: '/docs/integrations/xero',
  auth: {
    type: 'oauth2',
    authorizeUrl: 'https://login.xero.com/identity/connect/authorize',
    tokenUrl: 'https://identity.xero.com/connect/token',
    scopes: [
      'offline_access',
      'accounting.invoices',
      'accounting.payments',
      'accounting.contacts',
      'accounting.settings.read',
      'accounting.attachments',
    ],
    tokenAuth: 'basic',
    platformEnv: {
      clientId: 'XERO_INTEGRATION_CLIENT_ID',
      clientSecret: 'XERO_INTEGRATION_CLIENT_SECRET',
    },
    tenantFields: [
      { key: 'clientId', label: 'clientId', type: 'text', required: true },
      { key: 'clientSecret', label: 'clientSecret', type: 'password', required: true },
      {
        key: 'webhookKey',
        label: 'webhookKey',
        type: 'password',
        help: 'webhookKeyHelp',
        advanced: true,
      },
    ],
    tenantHelp: 'tenantHelp',
  },
  capabilities: ['accounting.invoices', 'accounting.customers', 'accounting.payments'],
  settings: [
    {
      key: 'tenantId',
      type: 'remote-select',
      label: 'tenantId',
      help: 'tenantIdHelp',
      source: 'organisations',
      required: true,
    },

    /* ---------- invoices ---------- */
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
      key: 'invoiceStatus',
      type: 'select',
      label: 'invoiceStatus',
      help: 'invoiceStatusHelp',
      default: 'AUTHORISED',
      options: [
        { value: 'AUTHORISED', label: 'invoiceStatusAuthorised' },
        { value: 'SUBMITTED', label: 'invoiceStatusSubmitted' },
        { value: 'DRAFT', label: 'invoiceStatusDraft' },
      ],
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'invoiceNumbers',
      type: 'select',
      label: 'invoiceNumbers',
      help: 'invoiceNumbersHelp',
      default: 'torqvoice',
      options: [
        { value: 'torqvoice', label: 'invoiceNumbersTorqvoice' },
        { value: 'xero', label: 'invoiceNumbersXero' },
      ],
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'reference',
      type: 'select',
      label: 'reference',
      help: 'referenceHelp',
      default: 'vehicle',
      options: [
        { value: 'vehicle', label: 'referenceVehicle' },
        { value: 'title', label: 'referenceTitle' },
        { value: 'invoiceNumber', label: 'referenceInvoiceNumber' },
        { value: 'none', label: 'referenceNone' },
      ],
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
      key: 'includeNotes',
      type: 'boolean',
      label: 'includeNotes',
      help: 'includeNotesHelp',
      default: true,
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'notesPosition',
      type: 'select',
      label: 'notesPosition',
      help: 'notesPositionHelp',
      default: 'below',
      options: [
        { value: 'below', label: 'notesPositionBelow' },
        { value: 'above', label: 'notesPositionAbove' },
      ],
      showWhen: { key: 'includeNotes', equals: true },
    },
    {
      key: 'includePartNumbers',
      type: 'boolean',
      label: 'includePartNumbers',
      help: 'includePartNumbersHelp',
      default: true,
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'brandingThemeId',
      type: 'remote-select',
      label: 'brandingThemeId',
      help: 'brandingThemeIdHelp',
      source: 'brandingThemes',
      showWhen: { key: 'pushInvoices', equals: true },
    },

    /* ---------- accounts and items ---------- */
    {
      key: 'laborAccount',
      type: 'remote-select',
      label: 'laborAccount',
      help: 'laborAccountHelp',
      source: 'salesAccounts',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'partsAccount',
      type: 'remote-select',
      label: 'partsAccount',
      help: 'partsAccountHelp',
      source: 'salesAccounts',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'shopFeeAccount',
      type: 'remote-select',
      label: 'shopFeeAccount',
      help: 'shopFeeAccountHelp',
      source: 'salesAccounts',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'laborItem',
      type: 'remote-select',
      label: 'laborItem',
      help: 'laborItemHelp',
      source: 'items',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'partsItem',
      type: 'remote-select',
      label: 'partsItem',
      help: 'partsItemHelp',
      source: 'items',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'matchItemsByPartNumber',
      type: 'boolean',
      label: 'matchItemsByPartNumber',
      help: 'matchItemsByPartNumberHelp',
      default: false,
      showWhen: { key: 'pushInvoices', equals: true },
    },

    /* ---------- tax ---------- */
    {
      key: 'taxAmounts',
      type: 'select',
      label: 'taxAmounts',
      help: 'taxAmountsHelp',
      default: 'billed',
      options: [
        { value: 'billed', label: 'taxAmountsBilled' },
        { value: 'xero', label: 'taxAmountsXero' },
      ],
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'taxType',
      type: 'remote-select',
      label: 'taxType',
      help: 'taxTypeHelp',
      source: 'taxRates',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'zeroTaxType',
      type: 'remote-select',
      label: 'zeroTaxType',
      help: 'zeroTaxTypeHelp',
      source: 'zeroTaxRates',
      showWhen: { key: 'pushInvoices', equals: true },
    },

    /* ---------- tracking ---------- */
    {
      key: 'tracking1',
      type: 'remote-select',
      label: 'tracking1',
      help: 'tracking1Help',
      source: 'trackingOptions',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'tracking2',
      type: 'remote-select',
      label: 'tracking2',
      help: 'tracking2Help',
      source: 'trackingOptions',
      showWhen: { key: 'pushInvoices', equals: true },
    },

    /* ---------- delivery ---------- */
    {
      key: 'sendFromXero',
      type: 'boolean',
      label: 'sendFromXero',
      help: 'sendFromXeroHelp',
      default: false,
      showWhen: { key: 'invoiceStatus', equals: 'AUTHORISED' },
    },
    {
      key: 'markAsSent',
      type: 'boolean',
      label: 'markAsSent',
      help: 'markAsSentHelp',
      default: true,
      showWhen: { key: 'sendFromXero', equals: false },
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
      key: 'updateContacts',
      type: 'boolean',
      label: 'updateContacts',
      help: 'updateContactsHelp',
      default: true,
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'voidOnDelete',
      type: 'boolean',
      label: 'voidOnDelete',
      help: 'voidOnDeleteHelp',
      default: true,
      showWhen: { key: 'pushInvoices', equals: true },
    },

    /* ---------- payments ---------- */
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
      key: 'cashAccount',
      type: 'remote-select',
      label: 'cashAccount',
      help: 'methodAccountHelp',
      source: 'paymentAccounts',
      showWhen: { key: 'pushPayments', equals: true },
    },
    {
      key: 'cardAccount',
      type: 'remote-select',
      label: 'cardAccount',
      help: 'methodAccountHelp',
      source: 'paymentAccounts',
      showWhen: { key: 'pushPayments', equals: true },
    },
    {
      key: 'transferAccount',
      type: 'remote-select',
      label: 'transferAccount',
      help: 'methodAccountHelp',
      source: 'paymentAccounts',
      showWhen: { key: 'pushPayments', equals: true },
    },
    {
      key: 'onlineAccount',
      type: 'remote-select',
      label: 'onlineAccount',
      help: 'onlineAccountHelp',
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
