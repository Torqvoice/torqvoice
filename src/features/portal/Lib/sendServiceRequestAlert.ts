/**
 * Delivery half of the service request alert.
 *
 * Everything here is best-effort. By the time this runs the request row is
 * already committed and the in-app notification has already fired, so a
 * workshop with no mail provider configured must never see its customers'
 * submissions fail. Nothing in this module is allowed to throw.
 */

import { db } from "@/lib/db";
import { getOrgFromAddress, sendOrgMail } from "@/lib/email";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import {
  buildServiceRequestEmailHtml,
  buildServiceRequestSubject,
  formatPreferredDate,
  parseRecipientList,
} from "./serviceRequestAlert";

const LOG_PREFIX = "[service-request-alert]";

/** Fallback recipients when no addresses are configured. */
async function getDefaultRecipients(organizationId: string): Promise<string[]> {
  const members = await db.organizationMember.findMany({
    where: { organizationId, role: { in: ["owner", "admin"] } },
    select: { user: { select: { email: true } } },
  });

  return parseRecipientList(
    members
      .map((m) => m.user?.email)
      .filter(Boolean)
      .join(","),
  );
}

export interface ServiceRequestAlertInput {
  organizationId: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  vehicleLabel: string;
  description: string;
  preferredDate: Date | null;
}

/**
 * Mail the workshop about a new service request.
 *
 * Returns the number of messages actually accepted by the provider, which is 0
 * for every ordinary "not configured" case: the feature is off, nobody is
 * listed, or no sender could be resolved. Callers use it for logging only.
 */
export async function sendServiceRequestAlert(
  input: ServiceRequestAlertInput,
): Promise<number> {
  try {
    const settingRows = await db.appSetting.findMany({
      where: {
        organizationId: input.organizationId,
        key: {
          in: [
            SETTING_KEYS.SERVICE_REQUEST_ALERTS_EMAIL,
            SETTING_KEYS.SERVICE_REQUEST_ALERTS_RECIPIENTS,
          ],
        },
      },
      select: { key: true, value: true },
    });

    const settings = new Map(settingRows.map((r) => [r.key, r.value]));
    if (settings.get(SETTING_KEYS.SERVICE_REQUEST_ALERTS_EMAIL) !== "true") {
      return 0;
    }

    // An explicit list wins outright. A workshop that routes these to a shared
    // service@ mailbox does not also want them in every owner's personal inbox.
    const configured = parseRecipientList(
      settings.get(SETTING_KEYS.SERVICE_REQUEST_ALERTS_RECIPIENTS),
    );
    const recipients =
      configured.length > 0
        ? configured
        : await getDefaultRecipients(input.organizationId);

    if (recipients.length === 0) {
      console.warn(
        `${LOG_PREFIX} enabled for org ${input.organizationId} but no valid recipients; skipping`,
      );
      return 0;
    }

    const org = await db.organization
      .findUnique({
        where: { id: input.organizationId },
        select: { name: true },
      })
      .catch(() => null);

    // Resolving the sender reads the org's email provider settings, which is
    // exactly what is missing when email was never set up. Without a sender
    // there is no honest way to send, so stop here rather than invent one.
    let fromAddress: string;
    try {
      fromAddress = await getOrgFromAddress(input.organizationId);
    } catch (error) {
      console.error(
        `${LOG_PREFIX} could not resolve a sender address (email is likely not configured); skipping:`,
        error,
      );
      return 0;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
    const organizationName = org?.name ?? "your workshop";

    const subject = buildServiceRequestSubject({
      customerName: input.customerName,
      vehicleLabel: input.vehicleLabel,
    });
    const html = buildServiceRequestEmailHtml({
      organizationName,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      vehicleLabel: input.vehicleLabel,
      description: input.description,
      preferredDate: formatPreferredDate(input.preferredDate),
      requestUrl: appUrl
        ? `${appUrl}/customers/${input.customerId}?tab=requests`
        : null,
    });

    // One message per recipient rather than a shared To line, so staff
    // addresses are not disclosed to each other, and so one bad address costs
    // only its own send.
    let sent = 0;
    for (const recipient of recipients) {
      try {
        await sendOrgMail(input.organizationId, {
          to: recipient,
          from: fromAddress,
          subject,
          html,
        });
        sent++;
      } catch (error) {
        console.error(`${LOG_PREFIX} email to ${recipient} failed:`, error);
      }
    }

    return sent;
  } catch (error) {
    // Settings lookup, member lookup, anything unforeseen. The request is
    // already saved; losing the email is the acceptable outcome here.
    console.error(`${LOG_PREFIX} alert failed:`, error);
    return 0;
  }
}
