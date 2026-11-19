import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Zoho's sign-in servers, one per region. The callback names the workshop's
 * own and the token exchange and refreshes must go there; only these hosts
 * are trusted with the client secret. From Zoho's serverinfo endpoint.
 */
export const ZOHO_ACCOUNTS_HOSTS = [
  'accounts.zoho.com',
  'accounts.zoho.eu',
  'accounts.zoho.in',
  'accounts.zoho.com.au',
  'accounts.zoho.jp',
  'accounts.zohocloud.ca',
  'accounts.zoho.sa',
  'accounts.zoho.uk',
  'accounts.zoho.ae',
  'accounts.zoho.sg',
  'accounts.zohohq.in',
  'accounts.zoho.com.cn',
]

/**
 * Zoho Books: issued invoices, their customers and their payments go to the
 * books, and payments recorded in Zoho come back.
 *
 * Zoho runs a data centre per region, and an account lives in one. Sign-in
 * starts at the US server, Zoho sends the workshop on to its own, and the
 * callback names that server (`accounts-server`); the token answer names the
 * API host (`api_domain`). One Zoho user can hold several organisations, so
 * which one to write to is the first setting. Everything else a bookkeeper
 * decides lives in the settings: status, numbering, reference, template and
 * location, the account, item and tax for each kind of line, who sends the
 * invoice, contact updates, deletes, and the account each kind of payment
 * lands in.
 *
 * Zoho joins scopes with commas. `access_type=offline` with `prompt=consent`
 * is what yields a refresh token on every connect, not only the first.
 */
export const manifest: ConnectorManifest = {
  id: 'zoho-books',
  name: 'Zoho Books',
  category: 'accounting',
  countries: 'global',
  logo: '/images/integrations/zoho-books.svg',
  docs: '/docs/integrations/zoho-books',
  auth: {
    type: 'oauth2',
    authorizeUrl: 'https://accounts.zoho.com/oauth/v2/auth',
    tokenUrl: 'https://accounts.zoho.com/oauth/v2/token',
    scopes: [
      'ZohoBooks.contacts.ALL',
      'ZohoBooks.invoices.ALL',
      'ZohoBooks.customerpayments.ALL',
      'ZohoBooks.settings.READ',
      'ZohoBooks.accountants.READ',
    ],
    scopeSeparator: ',',
    authorizeParams: { access_type: 'offline', prompt: 'consent' },
    authScheme: 'Zoho-oauthtoken',
    callbackParams: ['accounts-server', 'location'],
    regionalTokenServer: {
      param: 'accounts-server',
      path: '/oauth/v2/token',
      allowedHosts: ZOHO_ACCOUNTS_HOSTS,
    },
    platformEnv: {
      clientId: 'ZOHO_BOOKS_INTEGRATION_CLIENT_ID',
      clientSecret: 'ZOHO_BOOKS_INTEGRATION_CLIENT_SECRET',
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
      key: 'organizationId',
      type: 'remote-select',
      label: 'organizationId',
      help: 'organizationIdHelp',
      source: 'organizations',
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
      default: 'sent',
      options: [
        { value: 'sent', label: 'invoiceStatusSent' },
        { value: 'draft', label: 'invoiceStatusDraft' },
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
        { value: 'zoho', label: 'invoiceNumbersZoho' },
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
        // The customer's own reference / PO from the work order, for a
        // workshop that uses that field (Settings, Workshop).
        { value: 'customerReference', label: 'referenceCustomerReference' },
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
      default: 'customerNotes',
      options: [
        { value: 'customerNotes', label: 'notesPositionCustomerNotes' },
        { value: 'below', label: 'notesPositionBelow' },
        { value: 'above', label: 'notesPositionAbove' },
      ],
      // It places the vehicle too, so it stays visible with the notes off.
      showWhen: { key: 'pushInvoices', equals: true },
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
      key: 'templateId',
      type: 'remote-select',
      label: 'templateId',
      help: 'templateIdHelp',
      source: 'templates',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'locationId',
      type: 'remote-select',
      label: 'locationId',
      help: 'locationIdHelp',
      source: 'locations',
      showWhen: { key: 'pushInvoices', equals: true },
    },

    /* ---------- accounts and items ---------- */
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
      key: 'shopFeeAccount',
      type: 'remote-select',
      label: 'shopFeeAccount',
      help: 'shopFeeAccountHelp',
      source: 'incomeAccounts',
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
      key: 'taxId',
      type: 'remote-select',
      label: 'taxId',
      help: 'taxIdHelp',
      source: 'taxes',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'zeroTaxId',
      type: 'remote-select',
      label: 'zeroTaxId',
      help: 'zeroTaxIdHelp',
      source: 'zeroTaxes',
      showWhen: { key: 'pushInvoices', equals: true },
    },
    {
      key: 'roundingAdjustment',
      type: 'boolean',
      label: 'roundingAdjustment',
      help: 'roundingAdjustmentHelp',
      default: true,
      showWhen: { key: 'pushInvoices', equals: true },
    },

    /* ---------- delivery ---------- */
    {
      key: 'sendFromZoho',
      type: 'boolean',
      label: 'sendFromZoho',
      help: 'sendFromZohoHelp',
      default: false,
      showWhen: { key: 'invoiceStatus', equals: 'sent' },
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
      key: 'sameEmail',
      type: 'select',
      label: 'sameEmail',
      help: 'sameEmailHelp',
      default: 'create',
      options: [
        { value: 'create', label: 'sameEmailCreate' },
        { value: 'reuse', label: 'sameEmailReuse' },
      ],
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
