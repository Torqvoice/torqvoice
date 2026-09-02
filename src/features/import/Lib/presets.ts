/**
 * Known export layouts.
 *
 * A preset is a saved column mapping plus the parsing quirks of one source:
 * which header is which field, how it writes dates and decimals. It is data,
 * not code, so adding a source someone actually migrates from is a matter of
 * listing its headers here once a real export has been seen. Presets are
 * recognised from their headers, so the user rarely has to pick one.
 *
 * Only layouts we have seen are listed. Guessing a shop system's column names
 * would map the wrong things with confidence, which is worse than leaving the
 * generic synonyms to do their best and letting the user correct the rest.
 */

import type { ImportEntity } from './fields'
import type { DateFormat, DecimalSeparator } from './normalize'
import { normalizeHeader } from './normalize'

export interface ImportPreset {
  id: string
  name: string
  entity: ImportEntity
  /** Normalised headers that, together, identify this export. */
  signature: readonly string[]
  /** Normalised header → field key. Wins over the generic synonyms. */
  headerMap: Readonly<Record<string, string>>
  dateFormat?: DateFormat
  decimalSeparator?: DecimalSeparator
}

export const IMPORT_PRESETS: readonly ImportPreset[] = [
  {
    id: 'torqvoice-template',
    name: 'Torqvoice template',
    entity: 'customers',
    signature: ['customername', 'email', 'phone'],
    headerMap: {
      customername: 'customer.name',
      customernumber: 'customer.customerNumber',
      customernotes: 'customer.notes',
      licenseplate: 'vehicle.licensePlate',
      servicedate: 'service.date',
      mileageatservice: 'service.mileage',
      servicenotes: 'service.notes',
    },
  },
  {
    // Google Contacts, both the 2023 layout ("First Name", "Organization Name",
    // "E-mail 1 - Value") and the older one ("Given Name", "Organization 1 - Name").
    id: 'google-contacts',
    name: 'Google Contacts',
    entity: 'customers',
    signature: ['email1value', 'phone1value'],
    headerMap: {
      name: 'customer.name',
      givenname: 'customer.firstName',
      familyname: 'customer.lastName',
      firstname: 'customer.firstName',
      lastname: 'customer.lastName',
      email1value: 'customer.email',
      phone1value: 'customer.phone',
      organization1name: 'customer.company',
      organizationname: 'customer.company',
      address1formatted: 'customer.address',
      notes: 'customer.notes',
    },
  },
  {
    // Outlook's "Comma Separated Values" contact export.
    id: 'outlook-contacts',
    name: 'Outlook contacts',
    entity: 'customers',
    signature: ['firstname', 'lastname', 'emailaddress'],
    headerMap: {
      firstname: 'customer.firstName',
      lastname: 'customer.lastName',
      emailaddress: 'customer.email',
      mobilephone: 'customer.phone',
      primaryphone: 'customer.phone',
      businessphone: 'customer.phone',
      homephone: 'customer.phone',
      company: 'customer.company',
      businessstreet: 'customer.street',
      businesscity: 'customer.city',
      businesspostalcode: 'customer.postalCode',
      businessstate: 'customer.state',
      businesscountryregion: 'customer.country',
      homestreet: 'customer.street',
      homecity: 'customer.city',
      homepostalcode: 'customer.postalCode',
      homestate: 'customer.state',
      homecountryregion: 'customer.country',
      notes: 'customer.notes',
    },
  },
]

export function presetById(id: string | null | undefined): ImportPreset | undefined {
  if (!id) return undefined
  return IMPORT_PRESETS.find((p) => p.id === id)
}

/** The preset whose signature headers are all present, if any. */
export function detectPreset(columns: readonly string[]): ImportPreset | undefined {
  const present = new Set(columns.map(normalizeHeader))
  return IMPORT_PRESETS.find((p) => p.signature.every((h) => present.has(h)))
}
