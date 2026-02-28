"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { z } from "zod";
import crypto from "crypto";

const updateEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function updateEmail(data: { email: string }) {
  return withAuth(async ({ userId }) => {
    const parsed = updateEmailSchema.parse(data);

    const existing = await db.user.findFirst({
      where: { email: parsed.email, NOT: { id: userId } },
    });

    if (existing) {
      throw new Error("Email is already in use");
    }

    await db.user.update({
      where: { id: userId },
      data: { email: parsed.email },
    });

    return { email: parsed.email };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }] });
}

/**
 * Request email change with verification.
 * Instead of changing the email immediately, sends a confirmation link
 * to the NEW email address. The user's current email stays unchanged
 * until they click the confirmation link.
 */
export async function requestEmailChange(data: { email: string }) {
  return withAuth(async ({ userId }) => {
    const parsed = updateEmailSchema.parse(data);

    const existing = await db.user.findFirst({
      where: { email: parsed.email, NOT: { id: userId } },
    });

    if (existing) {
      throw new Error("Email is already in use");
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    if (!user) throw new Error("User not found");

    // Generate a secure token containing userId and new email
    const token = crypto.randomBytes(32).toString("hex");
    const payload = JSON.stringify({ userId, email: parsed.email, token });
    const encoded = Buffer.from(payload).toString("base64url");

    // Store the token in the verification table
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await db.verification.upsert({
      where: { identifier: `email-change:${userId}` },
      create: {
        identifier: `email-change:${userId}`,
        value: encoded,
        expiresAt,
      },
      update: {
        value: encoded,
        expiresAt,
      },
    });

    // Send confirmation email to the NEW address
    const baseURL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const confirmUrl = `${baseURL}/api/public/confirm-email-change?token=${encoded}`;

    const { sendMail, getFromAddress } = await import("@/lib/email");
    const from = await getFromAddress();

    await sendMail({
      from,
      to: parsed.email,
      subject: "Confirm your new Torqvoice email",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Email Change Confirmation</h2>
          <p>Hi${user.name ? ` ${user.name}` : ""},</p>
          <p>You requested to change your Torqvoice email to this address. Click the button below to confirm:</p>
          <div style="margin: 24px 0;">
            <a href="${confirmUrl}" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500;">
              Confirm Email Change
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">If you didn't request this change, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <p style="color: #6b7280; font-size: 12px;">
            This link will expire in 24 hours. If it doesn't work, copy and paste this URL into your browser:<br/>
            <a href="${confirmUrl}" style="color: #6b7280;">${confirmUrl}</a>
          </p>
        </div>
      `,
    });

    return { sent: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }] });
}
