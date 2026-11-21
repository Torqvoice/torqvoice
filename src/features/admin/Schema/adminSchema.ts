import { z } from 'zod'

export const userIdSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
})

export const confirmedUserSchema = userIdSchema.extend({
  /** The address the admin typed to confirm. */
  confirmEmail: z.string().min(1).max(320),
})

export const deleteOrganizationSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
})

export const userSortFields = ['name', 'email', 'createdAt', 'lastSeen', 'isSuperAdmin'] as const
export type UserSortField = (typeof userSortFields)[number]

export const adminSearchSchema = z.object({
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(userSortFields).default('lastSeen'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type DeleteOrganizationInput = z.infer<typeof deleteOrganizationSchema>
export type AdminSearchInput = z.infer<typeof adminSearchSchema>
