import { z } from 'zod'
import { isPhoneNumber } from '../Lib/phoneNumber'

export const createCustomerSchema = z.object({
  customerNumber: z.string().max(20).optional(),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  // Digits and the marks a number is written with; anything else was not a
  // phone number. Said under the field as `phone` (src/lib/field-errors.ts).
  phone: z
    .string()
    .refine(isPhoneNumber, {
      message: 'Enter a phone number: digits, spaces and + - ( ) .',
      params: { fieldIssue: 'phone' },
    })
    .optional(),
  address: z.string().optional(),
  company: z.string().optional(),
  taxId: z.string().optional(),
  taxExempt: z.boolean().optional(),
  reminderOptOut: z.boolean().optional(),
  /** Invoices wait for a reference / PO. Kept only by a workshop that uses the field. */
  poRequired: z.boolean().optional(),
  notes: z.string().optional(),
  /** An invoice design for this customer's invoices; null follows the default. */
  invoiceDesignId: z.string().nullable().optional(),
  /**
   * The workshop's own fields, as the full form shows them, by field id.
   * Checked and written with the record, all or nothing. Left out by a form
   * that does not show them, and then not looked at.
   */
  customFields: z.record(z.string(), z.string()).optional(),
})

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  id: z.string(),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>
