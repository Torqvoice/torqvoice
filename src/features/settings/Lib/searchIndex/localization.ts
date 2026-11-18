import type { SettingsEntry } from './types'

/**
 * Localization: language, currency, date and time. The date and time card is
 * titled from the `appearance` keys because it moved here from Appearance.
 */
export const localizationEntries: SettingsEntry[] = [
  {
    id: 'localization.language',
    page: 'localization',
    title: 'localization.languageTitle',
    description: 'localization.languageDescription',
    anchor: 'localization-language',
    keywords: ['language', 'workshop language', 'locale', 'translation', 'document language'],
  },
  {
    id: 'localization.workshopLanguage',
    page: 'localization',
    title: 'localization.language',
    anchor: 'localization-workshop-language',
    keywords: ['language', 'change language', 'invoice language', 'språk', 'sprache', 'langue'],
  },
  {
    id: 'localization.forceCustomerLocale',
    page: 'localization',
    title: 'localization.forceCustomerLocale',
    description: 'localization.forceCustomerLocaleHint',
    anchor: 'localization-force-customer-locale',
    keywords: ['force language', 'customer language', 'portal language', 'customer locale'],
  },
  {
    id: 'localization.defaultCountryCode',
    page: 'localization',
    title: 'localization.defaultCountryCode',
    description: 'localization.defaultCountryCodeHint',
    anchor: 'default-country-code',
    keywords: ['country code', 'dial code', 'phone prefix', 'calling code', '+47', 'country'],
  },
  {
    id: 'localization.currency',
    page: 'localization',
    title: 'currency.title',
    description: 'currency.description',
    anchor: 'localization-currency',
    keywords: ['currency', 'money', 'valuta', 'währung', 'devise', 'moneda'],
  },
  {
    id: 'localization.currencyCode',
    page: 'localization',
    title: 'currency.currencyLabel',
    anchor: 'localization-currency-code',
    keywords: ['currency', 'change currency', 'usd', 'eur', 'nok', 'gbp'],
  },
  {
    id: 'localization.currencyFormat',
    page: 'localization',
    title: 'currency.formatTitle',
    anchor: 'localization-currency-format',
    keywords: ['currency format', 'currency symbol', 'currency code', 'price format'],
  },
  {
    id: 'localization.dateTime',
    page: 'localization',
    title: 'appearance.dateTimeTitle',
    description: 'appearance.dateTimeDescription',
    anchor: 'localization-date-time',
    keywords: ['date', 'time', 'date and time', 'clock', 'format'],
  },
  {
    id: 'localization.dateFormat',
    page: 'localization',
    title: 'appearance.dateFormat',
    anchor: 'date-format',
    keywords: ['date format', 'dd/mm/yyyy', 'mm/dd/yyyy', 'date style'],
  },
  {
    id: 'localization.timeFormat',
    page: 'localization',
    title: 'appearance.timeFormat',
    anchor: 'time-format',
    keywords: ['time format', '24 hour', '12 hour', 'am pm', 'clock'],
  },
  {
    id: 'localization.weekStartDay',
    page: 'localization',
    title: 'workshop.weekStartDay',
    anchor: 'week-start-day',
    keywords: ['week start', 'first day of week', 'monday', 'sunday', 'calendar'],
  },
  {
    id: 'localization.timezone',
    page: 'localization',
    title: 'appearance.timezone',
    description: 'appearance.timezoneHint',
    anchor: 'timezone',
    keywords: ['timezone', 'time zone', 'utc', 'gmt', 'local time'],
  },
]
