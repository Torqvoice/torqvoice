import type { SettingsEntry } from './types'

/**
 * Payment. What prints on the invoice and what a customer agrees to; the
 * payment vendors themselves are connected under Integrations.
 */
export const paymentEntries: SettingsEntry[] = [
  {
    id: 'payment.details',
    page: 'payment',
    title: 'payment.detailsTitle',
    description: 'payment.detailsDescription',
    anchor: 'payment-details',
    keywords: ['payment details', 'bank details', 'payment info', 'accounts'],
  },
  {
    id: 'payment.bankAccount',
    page: 'payment',
    title: 'payment.bankAccount',
    description: 'payment.bankAccountHint',
    anchor: 'bankAccount',
    keywords: ['bank account', 'iban', 'account number', 'swift', 'bic', 'kontonummer'],
  },
  {
    id: 'payment.paymentTerms',
    page: 'payment',
    title: 'payment.paymentTerms',
    description: 'payment.paymentTermsHint',
    anchor: 'paymentTerms',
    keywords: ['payment terms', 'net 14', 'due on receipt', 'terms text', 'betalingsbetingelser'],
  },
  {
    id: 'payment.online',
    page: 'payment',
    title: 'payment.onlinePayments',
    description: 'payment.onlinePaymentsDescription',
    anchor: 'payment-online',
    keywords: ['online payments', 'card payments', 'stripe', 'vipps', 'paypal', 'pay online'],
  },
  {
    id: 'payment.termsOfSale',
    page: 'payment',
    title: 'payment.termsOfSale',
    description: 'payment.termsOfSaleDescription',
    anchor: 'payment-terms-of-sale',
    keywords: ['terms of sale', 'terms and conditions', 'sales terms', 'salgsbetingelser'],
  },
  {
    id: 'payment.termsOfSaleText',
    page: 'payment',
    title: 'payment.termsOfSaleText',
    anchor: 'termsOfSale',
    keywords: ['terms text', 'conditions text', 'withdrawal', 'returns policy'],
  },
  {
    id: 'payment.externalTermsUrl',
    page: 'payment',
    title: 'payment.externalTermsUrl',
    description: 'payment.externalTermsUrlHint',
    anchor: 'termsOfSaleUrl',
    keywords: ['terms url', 'terms link', 'external terms', 'website terms'],
  },
  {
    id: 'payment.publicTermsUrl',
    page: 'payment',
    title: 'payment.publicTermsUrl',
    description: 'payment.publicTermsUrlHint',
    anchor: 'payment-public-terms-url',
    keywords: ['public terms link', 'share terms', 'vipps terms', 'terms page'],
  },
]
