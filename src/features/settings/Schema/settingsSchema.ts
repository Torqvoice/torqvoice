import { z } from "zod";

export const SETTING_KEYS = {
  COMPANY_LOGO: "workshop.logo",
  WORKSHOP_ADDRESS: "workshop.address",
  WORKSHOP_PHONE: "workshop.phone",
  WORKSHOP_EMAIL: "workshop.email",
  DEFAULT_TAX_RATE: "workshop.defaultTaxRate",
  TAX_ENABLED: "workshop.taxEnabled",
  INVOICE_PREFIX: "workshop.invoicePrefix",
  INVOICE_START_NUMBER: "workshop.invoiceStartNumber",
  CURRENCY_SYMBOL: "workshop.currencySymbol",
  CURRENCY_CODE: "workshop.currencyCode",
  INVOICE_BANK_ACCOUNT: "invoice.bankAccount",
  INVOICE_ORG_NUMBER: "invoice.orgNumber",
  INVOICE_PAYMENT_TERMS: "invoice.paymentTerms",
  INVOICE_FOOTER_NOTE: "invoice.footerNote",
  INVOICE_SHOW_BANK_ACCOUNT: "invoice.showBankAccount",
  INVOICE_SHOW_ORG_NUMBER: "invoice.showOrgNumber",
  INVOICE_DUE_DAYS: "invoice.dueDays",
  UNIT_SYSTEM: "workshop.unitSystem",
  DEFAULT_TECHNICIAN: "workshop.defaultTechnician",
  WORKING_HOURS: "workshop.workingHours",
  DEFAULT_LABOR_RATE: "workshop.defaultLaborRate",
  QUOTE_PREFIX: "workshop.quotePrefix",
  QUOTE_VALID_DAYS: "workshop.quoteValidDays",
  EMAIL_FROM_NAME: "email.fromName",
  EMAIL_ENABLED: "email.enabled",
  INVOICE_TEMPLATE: "invoice.template",
  INVOICE_PRIMARY_COLOR: "invoice.primaryColor",
  INVOICE_FONT_FAMILY: "invoice.fontFamily",
  INVOICE_SHOW_LOGO: "invoice.showLogo",
  INVOICE_SHOW_COMPANY_NAME: "invoice.showCompanyName",
  INVOICE_HEADER_STYLE: "invoice.headerStyle",
  PAYMENT_PROVIDERS_ENABLED: "payment.providersEnabled",
  PAYMENT_STRIPE_SECRET_KEY: "payment.stripe.secretKey",
  PAYMENT_STRIPE_PUBLISHABLE_KEY: "payment.stripe.publishableKey",
  PAYMENT_STRIPE_WEBHOOK_SECRET: "payment.stripe.webhookSecret",
  PAYMENT_VIPPS_CLIENT_ID: "payment.vipps.clientId",
  PAYMENT_VIPPS_CLIENT_SECRET: "payment.vipps.clientSecret",
  PAYMENT_VIPPS_SUBSCRIPTION_KEY: "payment.vipps.subscriptionKey",
  PAYMENT_VIPPS_MSN: "payment.vipps.merchantSerialNumber",
  PAYMENT_VIPPS_USE_TEST: "payment.vipps.useTestMode",
  PAYMENT_TERMS_OF_SALE: "payment.termsOfSale",
  PAYMENT_TERMS_OF_SALE_URL: "payment.termsOfSaleUrl",
  LICENSE_KEY: "license.key",
  LICENSE_VALID: "license.valid",
  LICENSE_CHECKED_AT: "license.checkedAt",
  LICENSE_PLAN: "license.plan",
  DATE_FORMAT: "workshop.dateFormat",
  TIME_FORMAT: "workshop.timeFormat",
  TIMEZONE: "workshop.timezone",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export const workshopSettingsSchema = z.object({
  [SETTING_KEYS.WORKSHOP_ADDRESS]: z.string().optional(),
  [SETTING_KEYS.WORKSHOP_PHONE]: z.string().optional(),
  [SETTING_KEYS.WORKSHOP_EMAIL]: z.string().email("Invalid email").optional().or(z.literal("")),
  [SETTING_KEYS.DEFAULT_TAX_RATE]: z.string().optional(),
  [SETTING_KEYS.INVOICE_PREFIX]: z.string().optional(),
  [SETTING_KEYS.CURRENCY_SYMBOL]: z.string().optional(),
});

export const invoiceSettingsSchema = z.object({
  [SETTING_KEYS.INVOICE_BANK_ACCOUNT]: z.string().optional(),
  [SETTING_KEYS.INVOICE_ORG_NUMBER]: z.string().optional(),
  [SETTING_KEYS.INVOICE_PAYMENT_TERMS]: z.string().optional(),
  [SETTING_KEYS.INVOICE_FOOTER_NOTE]: z.string().optional(),
  [SETTING_KEYS.INVOICE_SHOW_BANK_ACCOUNT]: z.string().optional(),
  [SETTING_KEYS.INVOICE_SHOW_ORG_NUMBER]: z.string().optional(),
  [SETTING_KEYS.INVOICE_DUE_DAYS]: z.string().optional(),
});

export type WorkshopSettings = z.infer<typeof workshopSettingsSchema>;
export type InvoiceSettings = z.infer<typeof invoiceSettingsSchema>;
