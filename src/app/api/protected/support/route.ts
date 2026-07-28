/**
 * Submits an in-app support request to the configured administrator.
 *
 * A route handler rather than a server action because of the attachments:
 * server action bodies are capped at 1MB by default, which a single screenshot
 * can exceed. This follows the same shape as the other upload endpoints under
 * /api/protected/upload — getAuthContext plus multipart form data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { getFromAddress, sendMail } from "@/lib/email";
import { getSupportRecipient, isSupportEnabled } from "@/lib/support";
import {
  buildSupportEmailHtml,
  MAX_ATTACHMENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  sanitizeFilename,
  validateSupportRequest,
} from "@/features/support/Lib/supportRequest";

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Re-checked here on purpose. The widget is hidden when the feature is off,
  // but hiding a button is not access control — the endpoint has to refuse on
  // its own or a disabled feature is still reachable.
  if (!(await isSupportEnabled())) {
    return NextResponse.json({ error: "Support requests are not enabled" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  const validation = validateSupportRequest({
    subject: String(formData.get("subject") ?? ""),
    message: String(formData.get("message") ?? ""),
    attachments: files.map((f) => ({
      filename: f.name,
      contentType: f.type,
      size: f.size,
    })),
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  const [organization, user] = await Promise.all([
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    }),
    db.user.findUnique({
      where: { id: ctx.userId },
      select: { name: true, email: true },
    }),
  ]);

  if (!user?.email) {
    return NextResponse.json({ error: "No reply address for this account" }, { status: 400 });
  }

  // Read the files only after validation has cleared the declared sizes, so an
  // oversized upload is rejected without being pulled into memory first.
  let consumed = 0;
  const attachments: { filename: string; content: Buffer }[] = [];
  for (const [index, file] of files.entries()) {
    const buffer = Buffer.from(await file.arrayBuffer());
    consumed += buffer.byteLength;
    // File.size is client-declared; this is the figure that actually arrived.
    if (consumed > MAX_TOTAL_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "attachments-too-large" }, { status: 400 });
    }
    attachments.push({
      filename: sanitizeFilename(file.name, `attachment-${index + 1}`),
      content: buffer,
    });
  }

  const html = buildSupportEmailHtml(validation.subject, validation.message, {
    organizationName: organization?.name ?? "Unknown organization",
    organizationId: ctx.organizationId,
    userName: user.name,
    userEmail: user.email,
    pageUrl: formData.get("pageUrl") ? String(formData.get("pageUrl")).slice(0, 500) : null,
    userAgent: request.headers.get("user-agent"),
    // Same variable the About page reads, so the version in a ticket matches
    // what the user can read back to you.
    appVersion: process.env.APP_VERSION || null,
    submittedAt: new Date().toISOString(),
  });

  try {
    // Deliberately the platform mailer (system_settings, configured under
    // /admin/settings) rather than the organization's own. A support request
    // must not depend on the workshop's mail server, which may well be the
    // thing they are writing in about.
    const [from, to] = await Promise.all([getFromAddress(), getSupportRecipient()]);
    await sendMail({
      from,
      to,
      subject: `[Support] ${validation.subject}`,
      html,
      attachments,
    });
  } catch (error) {
    // The reason a send failed is a platform configuration detail, so it is
    // logged rather than handed to the user. The usual cause is platform email
    // never having been set up — note that an organization's own working SMTP
    // does not satisfy this path.
    console.error(
      "Support request failed to send (check platform email under /admin/settings):",
      error,
    );
    return NextResponse.json({ error: "send-failed" }, { status: 502 });
  }

  return NextResponse.json({ sent: true });
}
