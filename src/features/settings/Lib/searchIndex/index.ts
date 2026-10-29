import type { SettingsEntry } from './types'
import { aboutEntries } from './about'
import { accountEntries } from './account'
import { alertsEntries } from './alerts'
import { appearanceEntries } from './appearance'
import { companyEntries } from './company'
import { customerPortalEntries } from './customerPortal'
import { dataEntries } from './data'
import { emailTemplatesEntries } from './emailTemplates'
import { inspectionRemindersEntries } from './inspectionReminders'
import { installEntries } from './install'
import { integrationsEntries } from './integrations'
import { invoiceEntries } from './invoice'
import { licenseEntries } from './license'
import { localizationEntries } from './localization'
import { maintenanceEntries } from './maintenance'
import { paymentEntries } from './payment'
import { reportScheduleEntries } from './reportSchedule'
import { subscriptionEntries } from './subscription'
import { supportEntries } from './support'
import { taxEntries } from './tax'
import { teamEntries } from './team'
import { templatesEntries } from './templates'
import { tireHotelEntries } from './tireHotel'
import { warrantyEntries } from './warranty'
import { webhooksEntries } from './webhooks'
import { workOrderStatusesEntries } from './workOrderStatuses'
import { workshopEntries } from './workshop'

export type { SettingsEntry } from './types'

/**
 * Everything inside the settings pages that search can land on, one module
 * per page. `search-index.test.ts` holds each entry to the messages and the
 * page source, so a renamed key or a dropped anchor fails the tests rather
 * than a search.
 */
export const SETTINGS_SEARCH_INDEX: readonly SettingsEntry[] = [
  ...companyEntries,
  ...subscriptionEntries,
  ...accountEntries,
  ...teamEntries,
  ...localizationEntries,
  ...appearanceEntries,
  ...supportEntries,
  ...invoiceEntries,
  ...templatesEntries,
  ...paymentEntries,
  ...taxEntries,
  ...warrantyEntries,
  ...emailTemplatesEntries,
  ...customerPortalEntries,
  ...workshopEntries,
  ...workOrderStatusesEntries,
  ...maintenanceEntries,
  ...inspectionRemindersEntries,
  ...alertsEntries,
  ...tireHotelEntries,
  ...reportScheduleEntries,
  ...integrationsEntries,
  ...webhooksEntries,
  ...dataEntries,
  ...installEntries,
  ...licenseEntries,
  ...aboutEntries,
]
