import type { SettingsEntry } from './types'

/**
 * Company. Two cards, logo and details; the detail fields are reached through
 * the inputs' own ids.
 */
export const companyEntries: SettingsEntry[] = [
  {
    id: 'company.logo',
    page: 'company',
    title: 'company.logoTitle',
    description: 'company.logoHint',
    anchor: 'company-logo',
    keywords: ['logo', 'upload logo', 'company logo', 'branding', 'brand', 'image'],
  },
  {
    id: 'company.details',
    page: 'company',
    title: 'company.detailsTitle',
    anchor: 'company-details',
    keywords: [
      'company details',
      'business details',
      'business info',
      'workshop details',
      'contact info',
    ],
  },
  {
    id: 'company.shopName',
    page: 'company',
    title: 'company.shopName',
    anchor: 'workshopName',
    keywords: ['company name', 'shop name', 'workshop name', 'business name', 'rename'],
  },
  {
    id: 'company.orgNumber',
    page: 'company',
    title: 'company.orgNumber',
    anchor: 'orgNumber',
    keywords: [
      'organization number',
      'org number',
      'business number',
      'vat number',
      'company registration',
      'orgnr',
      'abn',
      'cvr',
    ],
  },
  {
    id: 'company.orgNumberLabel',
    page: 'company',
    title: 'company.orgNumberLabel',
    description: 'company.orgNumberLabelHint',
    anchor: 'orgNumberLabel',
    keywords: ['org number label', 'vat no', 'abn', 'registration label'],
  },
  {
    id: 'company.phone',
    page: 'company',
    title: 'company.phone',
    anchor: 'workshopPhone',
    keywords: ['phone', 'phone number', 'telephone', 'company phone', 'contact number'],
  },
  {
    id: 'company.email',
    page: 'company',
    title: 'company.email',
    anchor: 'workshopEmail',
    keywords: ['email', 'company email', 'workshop email', 'contact email', 'reply address'],
  },
  {
    id: 'company.slogan',
    page: 'company',
    title: 'company.slogan',
    description: 'company.sloganHint',
    anchor: 'workshopSlogan',
    keywords: ['slogan', 'tagline', 'motto', 'subtitle'],
  },
  {
    id: 'company.address',
    page: 'company',
    title: 'company.address',
    anchor: 'workshopAddress',
    keywords: ['address', 'street', 'location', 'postal address', 'company address'],
  },
  {
    id: 'company.addNewCompany',
    page: 'company',
    title: 'company.addNewCompany',
    anchor: 'company-add-company',
    keywords: ['add company', 'new company', 'new workshop', 'second workshop', 'organization'],
  },
]
