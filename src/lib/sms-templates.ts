import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";

export const SMS_TEMPLATE_DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY]:
    "Your invoice is ready. View it here: {share_link}",
  [SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY]:
    "Your quote is ready for review. View it here: {share_link}",
  [SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY]:
    "Your vehicle inspection report is ready. View it here: {share_link}",
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS]:
    "Work has started on your vehicle. We'll keep you updated.",
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS]:
    "Your vehicle is waiting for parts. We'll notify you when work resumes.",
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_READY]:
    "Your vehicle is ready for pickup!",
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED]:
    "Your service is complete. Thank you for your business!",
  [SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED]:
    "Payment of {amount} received for invoice {invoice_number}. Thank you!",
  [SETTING_KEYS.SMS_TEMPLATE_INSPECTION_DUE]:
    "Hi {customer_name}, your {vehicle} is due for its periodic inspection on {due_date}. Contact {company_name} to book an appointment.",
  [SETTING_KEYS.SMS_TEMPLATE_SERVICE_DUE]:
    "Hi {customer_name}, your {vehicle} is due for a service. Contact {company_name} to book an appointment.",
};

/**
 * Replace `{variable_name}` placeholders in a template string with actual values.
 */
export function interpolateSmsTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in variables ? variables[key] : match;
  });
}
