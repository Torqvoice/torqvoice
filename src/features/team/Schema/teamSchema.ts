import { z } from "zod";

export const roles = ["owner", "admin", "member"] as const;
export type Role = (typeof roles)[number];

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
  roleId: z.string().optional(),
});

export const updateMemberRoleSchema = z.object({
  memberId: z.string(),
  role: z.enum(["admin", "member"]),
});

export const createRoleSchema = z.object({
  name: z.string().min(1).max(50),
  isAdmin: z.boolean().default(false),
  permissions: z.array(
    z.object({
      action: z.string(),
      subject: z.string(),
    }),
  ),
});

export const updateRoleSchema = z.object({
  roleId: z.string(),
  name: z.string().min(1).max(50).optional(),
  isAdmin: z.boolean().optional(),
  permissions: z
    .array(
      z.object({
        action: z.string(),
        subject: z.string(),
      }),
    )
    .optional(),
});

export const assignRoleSchema = z.object({
  memberId: z.string(),
  role: z.enum(["admin", "member"]).optional(),
  roleId: z.string().nullable(),
});

export const sendInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
  roleId: z.string().optional(),
});

export const cancelInvitationSchema = z.object({
  invitationId: z.string(),
});

export const acceptInvitationSchema = z.object({
  token: z.string(),
});
