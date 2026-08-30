import { z } from 'zod'

export const SETTING_KEYS = {
  COMPANY_LOGO: 'workshop.logo',
  WORKSHOP_ADDRESS: 'workshop.address',
  /// One line under the shop's name on its documents, e.g. what it specialises
  /// in and where. Empty means the letterhead carries the name alone.
  WORKSHOP_SLOGAN: 'workshop.slogan',
  WORKSHOP_PHONE: 'workshop.phone',
  WORKSHOP_EMAIL: 'workshop.email',
  DEFAULT_TAX_RATE: 'workshop.defaultTaxRate',
  TAX_ENABLED: 'workshop.taxEnabled',
  TAX_INCLUSIVE: 'workshop.taxInclusive',
  TAX_LABEL: 'workshop.taxLabel',
  INVOICE_PREFIX: 'workshop.invoicePrefix',
  INVOICE_START_NUMBER: 'workshop.invoiceStartNumber',
  CURRENCY_SYMBOL: 'workshop.currencySymbol',
  CURRENCY_CODE: 'workshop.currencyCode',
  CURRENCY_FORMAT: 'workshop.currencyFormat',
  INVOICE_BANK_ACCOUNT: 'invoice.bankAccount',
  INVOICE_ORG_NUMBER: 'invoice.orgNumber',
  INVOICE_PAYMENT_TERMS: 'invoice.paymentTerms',
  INVOICE_FOOTER_NOTE: 'invoice.footerNote',
  INVOICE_SHOW_BANK_ACCOUNT: 'invoice.showBankAccount',
  INVOICE_SHOW_ORG_NUMBER: 'invoice.showOrgNumber',
  INVOICE_DUE_DAYS: 'invoice.dueDays',
  UNIT_SYSTEM: 'workshop.unitSystem',
  DEFAULT_TECHNICIAN: 'workshop.defaultTechnician',
  DEFAULT_TECHNICIAN_ID: 'workshop.defaultTechnicianId',
  DEFAULT_LABOR_RATE: 'workshop.defaultLaborRate',
  QUOTE_PREFIX: 'workshop.quotePrefix',
  QUOTE_VALID_DAYS: 'workshop.quoteValidDays',
  EMAIL_FROM_NAME: 'email.fromName',
  EMAIL_ENABLED: 'email.enabled',
  INVOICE_TEMPLATE: 'invoice.template',
  INVOICE_PRIMARY_COLOR: 'invoice.primaryColor',
  /// Sheet color behind the document. Empty means the paper stays white.
  INVOICE_BACKGROUND_COLOR: 'invoice.backgroundColor',
  /// Body and heading color. Empty means the near-black default.
  INVOICE_TEXT_COLOR: 'invoice.textColor',
  /// The company name on the letterhead. Empty leaves each header style its own
  /// default: white on a colored band, the primary color on white.
  INVOICE_COMPANY_TEXT_COLOR: 'invoice.companyTextColor',
  /// Line where the sheet meets a framed letterhead. Empty means no line.
  INVOICE_FRAME_BORDER_COLOR: 'invoice.frameBorderColor',
  /// "false" prints the frame flat against the sheet, with no shadow.
  INVOICE_FRAME_SHADOW: 'invoice.frameShadow',
  /// Which edge the framed rail runs down: "left" or "right".
  INVOICE_FRAME_SIDE: 'invoice.frameSide',
  /// Rounding, in points, where the framed rail meets the header band.
  INVOICE_FRAME_RADIUS: 'invoice.frameRadius',
  INVOICE_FONT_FAMILY: 'invoice.fontFamily',
  INVOICE_SHOW_LOGO: 'invoice.showLogo',
  INVOICE_SHOW_COMPANY_NAME: 'invoice.showCompanyName',
  INVOICE_HEADER_STYLE: 'invoice.headerStyle',
  INVOICE_LOGO_SIZE: 'invoice.logoSize',
  QUOTE_LOGO_SIZE: 'quote.logoSize',
  PAYMENT_PROVIDERS_ENABLED: 'payment.providersEnabled',
  PAYMENT_STRIPE_SECRET_KEY: 'payment.stripe.secretKey',
  PAYMENT_STRIPE_PUBLISHABLE_KEY: 'payment.stripe.publishableKey',
  PAYMENT_STRIPE_WEBHOOK_SECRET: 'payment.stripe.webhookSecret',
  PAYMENT_VIPPS_CLIENT_ID: 'payment.vipps.clientId',
  PAYMENT_VIPPS_CLIENT_SECRET: 'payment.vipps.clientSecret',
  PAYMENT_VIPPS_SUBSCRIPTION_KEY: 'payment.vipps.subscriptionKey',
  PAYMENT_VIPPS_MSN: 'payment.vipps.merchantSerialNumber',
  PAYMENT_VIPPS_USE_TEST: 'payment.vipps.useTestMode',
  PAYMENT_PAYPAL_CLIENT_ID: 'payment.paypal.clientId',
  PAYMENT_PAYPAL_CLIENT_SECRET: 'payment.paypal.clientSecret',
  PAYMENT_PAYPAL_USE_SANDBOX: 'payment.paypal.useSandbox',
  PAYMENT_TERMS_OF_SALE: 'payment.termsOfSale',
  PAYMENT_TERMS_OF_SALE_URL: 'payment.termsOfSaleUrl',
  LICENSE_KEY: 'license.key',
  LICENSE_VALID: 'license.valid',
  LICENSE_CHECKED_AT: 'license.checkedAt',
  LICENSE_PLAN: 'license.plan',
  LICENSE_EXPIRES_AT: 'license.expiresAt',
  DATE_FORMAT: 'workshop.dateFormat',
  TIME_FORMAT: 'workshop.timeFormat',
  TIMEZONE: 'workshop.timezone',
  QUOTE_PRIMARY_COLOR: 'quote.primaryColor',
  QUOTE_BACKGROUND_COLOR: 'quote.backgroundColor',
  QUOTE_TEXT_COLOR: 'quote.textColor',
  QUOTE_COMPANY_TEXT_COLOR: 'quote.companyTextColor',
  QUOTE_FRAME_BORDER_COLOR: 'quote.frameBorderColor',
  QUOTE_FRAME_SHADOW: 'quote.frameShadow',
  QUOTE_FRAME_SIDE: 'quote.frameSide',
  QUOTE_FRAME_RADIUS: 'quote.frameRadius',
  /// The workshop's own saved designs: a JSON list of named layout+template
  /// snapshots the designer can bring back after trying something else.
  DESIGNER_SAVED_DESIGNS: 'designer.savedDesigns',
  QUOTE_FONT_FAMILY: 'quote.fontFamily',
  QUOTE_HEADER_STYLE: 'quote.headerStyle',
  PREDICTED_MAINTENANCE_ENABLED: 'maintenance.enabled',
  MAINTENANCE_SERVICE_INTERVAL: 'maintenance.serviceInterval',
  MAINTENANCE_APPROACHING_THRESHOLD: 'maintenance.approachingThreshold',
  INVENTORY_MARKUP_MULTIPLIER: 'inventory.markupMultiplier',
  /// Unit of measure pre-filled on newly created inventory parts ("pcs",
  /// "l", "qt"...). Empty means new parts start with no unit.
  INVENTORY_DEFAULT_UNIT: 'inventory.defaultUnit',
  /**
   * Whether the desk is told when a technician moves a job from the app.
   *
   * On by default: the point of the technician app is that the office stops
   * having to walk into the bay and ask, and a notification nobody switched on
   * does not achieve that. A shop that finds it noisy can turn it off.
   */
  TECHNICIAN_STATUS_ALERTS: 'workshop.technicianStatusAlerts.inApp',

  LOW_STOCK_ALERTS_ENABLED: 'inventory.lowStockAlerts.enabled',
  /// Org-wide fallback reorder point, applied to parts with no minQuantity of
  /// their own. 0 means only explicitly configured parts are watched.
  LOW_STOCK_DEFAULT_THRESHOLD: 'inventory.lowStockAlerts.defaultThreshold',
  LOW_STOCK_ALERTS_IN_APP: 'inventory.lowStockAlerts.inApp',
  LOW_STOCK_ALERTS_EMAIL: 'inventory.lowStockAlerts.email',
  LOW_STOCK_ALERTS_EMAIL_MIN_INTERVAL_HOURS: 'inventory.lowStockAlerts.emailMinIntervalHours',
  /// Internal bookkeeping — the last time a digest actually went out, used to
  /// enforce the minimum interval. Not user-editable.
  LOW_STOCK_ALERTS_LAST_EMAIL_AT: 'inventory.lowStockAlerts.lastEmailAt',
  PARTS_DEFAULT_MARKUP_PERCENT: 'parts.defaultMarkupPercent',
  PARTS_MARKUP_APPLIES_TO_INVENTORY: 'parts.markupAppliesToInventory',
  SMS_TEMPLATE_INVOICE_READY: 'sms.template.invoiceReady',
  SMS_TEMPLATE_QUOTE_READY: 'sms.template.quoteReady',
  SMS_TEMPLATE_INSPECTION_READY: 'sms.template.inspectionReady',
  SMS_TEMPLATE_STATUS_IN_PROGRESS: 'sms.template.statusInProgress',
  SMS_TEMPLATE_STATUS_WAITING_PARTS: 'sms.template.statusWaitingParts',
  SMS_TEMPLATE_STATUS_READY: 'sms.template.statusReady',
  SMS_TEMPLATE_STATUS_COMPLETED: 'sms.template.statusCompleted',
  SMS_TEMPLATE_PAYMENT_RECEIVED: 'sms.template.paymentReceived',
  // Telegram templates
  TELEGRAM_TEMPLATE_INVOICE_READY: 'telegram.template.invoiceReady',
  TELEGRAM_TEMPLATE_QUOTE_READY: 'telegram.template.quoteReady',
  TELEGRAM_TEMPLATE_STATUS_IN_PROGRESS: 'telegram.template.statusInProgress',
  TELEGRAM_TEMPLATE_STATUS_COMPLETED: 'telegram.template.statusCompleted',
  TELEGRAM_TEMPLATE_PAYMENT_RECEIVED: 'telegram.template.paymentReceived',
  TELEGRAM_SHOW_QR_ON_INVOICE: 'telegram.showQrOnInvoice',
  PORTAL_ENABLED: 'portal.enabled',
  PORTAL_DESCRIPTION: 'portal.description',
  PORTAL_HOURS: 'portal.hours',
  /// Off by default. Every service request already raises an in-app
  /// notification; this adds email on top, and stays opt-in because a workshop
  /// with no mail provider configured would otherwise generate failed sends.
  SERVICE_REQUEST_ALERTS_EMAIL: 'portal.serviceRequestAlerts.email',
  /// Optional free-text list of addresses. Empty means the alert goes to every
  /// owner and admin in the organization.
  SERVICE_REQUEST_ALERTS_RECIPIENTS: 'portal.serviceRequestAlerts.recipients',
  PORTAL_BACKGROUND_TYPE: 'portal.background.type',
  PORTAL_BACKGROUND_TEMPLATE: 'portal.background.template',
  PORTAL_BACKGROUND_IMAGE: 'portal.background.image',
  WORKBOARD_WEEK_START_DAY: 'workboard.weekStartDay',
  WORKBOARD_WORK_DAY_START: 'workboard.workDayStart',
  WORKBOARD_WORK_DAY_END: 'workboard.workDayEnd',
  INVOICE_LAYOUT_CONFIG: 'invoice.layoutConfig',
  QUOTE_LAYOUT_CONFIG: 'quote.layoutConfig',
  AI_PROVIDER: 'ai.provider',
  AI_API_KEY: 'ai.apiKey',
  AI_MODEL: 'ai.model',
  AI_ENABLED: 'ai.enabled',
  SERVICE_TYPE: 'workshop.serviceType',
  WORKSHOP_LOCALE: 'workshop.locale',
  WORKSHOP_DEFAULT_COUNTRY_CODE: 'workshop.defaultCountryCode',
  FORCE_CUSTOMER_LOCALE: 'workshop.forceCustomerLocale',
  /// Feature hints the workshop has already been shown, as a JSON array of
  /// ids. Kept per workshop rather than per person: the hint announces that
  /// something appeared in this workshop's sidebar, and once somebody here
  /// has seen it, the workshop has been told.
  FEATURE_HINTS_SEEN: 'featureHints.seen',
  /// Hints raised by a setting being switched on and not yet dismissed.
  /// Separate from the seen list because being eligible for a hint and
  /// having been shown one are different things: a workshop that has had
  /// Telegram on for a year is eligible forever and should never be told.
  FEATURE_HINTS_PENDING: 'featureHints.pending',

  /// Tire hotel is off until a workshop opts in. Everything about the module
  /// — sidebar entry, routes, cron sweeps — keys off this one flag, so a shop
  /// that does not store tires never sees it.
  TIRE_HOTEL_ENABLED: 'tireHotel.enabled',
  /// Tread depth below which a summer tire is flagged for replacement, in mm.
  /// Legal minimums differ by country, so the workshop sets its own.
  TIRE_HOTEL_SUMMER_REPLACE_MM: 'tireHotel.summerReplaceMm',
  /// Same for winter tires, which lose grip well above the summer limit.
  TIRE_HOTEL_WINTER_REPLACE_MM: 'tireHotel.winterReplaceMm',
  /// Default number of tires a newly created shelf holds.
  TIRE_HOTEL_DEFAULT_CAPACITY: 'tireHotel.defaultCapacity',
  /// Warn in-app once the warehouse passes this fraction of total capacity.
  TIRE_HOTEL_CAPACITY_WARN_PERCENT: 'tireHotel.capacityWarnPercent',
  /// Prefilled storage fee, offered when a set is billed.
  TIRE_HOTEL_DEFAULT_SEASONAL_PRICE: 'tireHotel.defaultSeasonalPrice',
  /// What each kind of prep work is charged at, as JSON keyed by treatment
  /// type. A type with no price here produces no line, which is how a shop
  /// that folds washing into the storage fee keeps it off the invoice.
  TIRE_HOTEL_TREATMENT_PRICES: 'tireHotel.treatmentPrices',
  DEFAULT_WARRANTY_MONTHS: 'defaultWarrantyMonths',
  DEFAULT_WARRANTY_MILEAGE: 'defaultWarrantyMileage',
  DEFAULT_WARRANTY_NOTES: 'defaultWarrantyNotes',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

export const workshopSettingsSchema = z.object({
  [SETTING_KEYS.WORKSHOP_ADDRESS]: z.string().optional(),
  [SETTING_KEYS.WORKSHOP_SLOGAN]: z.string().max(160).optional(),
  [SETTING_KEYS.WORKSHOP_PHONE]: z.string().optional(),
  [SETTING_KEYS.WORKSHOP_EMAIL]: z.string().email('Invalid email').optional().or(z.literal('')),
  [SETTING_KEYS.DEFAULT_TAX_RATE]: z.string().optional(),
  [SETTING_KEYS.INVOICE_PREFIX]: z.string().optional(),
  [SETTING_KEYS.CURRENCY_SYMBOL]: z.string().optional(),
})

export const invoiceSettingsSchema = z.object({
  [SETTING_KEYS.INVOICE_BANK_ACCOUNT]: z.string().optional(),
  [SETTING_KEYS.INVOICE_ORG_NUMBER]: z.string().optional(),
  [SETTING_KEYS.INVOICE_PAYMENT_TERMS]: z.string().optional(),
  [SETTING_KEYS.INVOICE_FOOTER_NOTE]: z.string().optional(),
  [SETTING_KEYS.INVOICE_SHOW_BANK_ACCOUNT]: z.string().optional(),
  [SETTING_KEYS.INVOICE_SHOW_ORG_NUMBER]: z.string().optional(),
  [SETTING_KEYS.INVOICE_DUE_DAYS]: z.string().optional(),
})

export type WorkshopSettings = z.infer<typeof workshopSettingsSchema>
export type InvoiceSettings = z.infer<typeof invoiceSettingsSchema>
