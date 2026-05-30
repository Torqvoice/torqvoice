import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";

export const SMS_TEMPLATE_DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY]:
    "Tu factura está lista. Mírala aquí: {share_link}",
  [SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY]:
    "Tu presupuesto está listo para revisión. Míralo aquí: {share_link}",
  [SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY]:
    "El informe de inspección de tu vehículo está listo. Míralo aquí: {share_link}",
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS]:
    "Hemos comenzado a trabajar en tu vehículo. Te mantendremos informado.",
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS]:
    "Tu vehículo está en espera de repuestos. Te notificaremos cuando se reanude el trabajo.",
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_READY]:
    "¡Tu vehículo está listo para retirar!",
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED]:
    "Tu servicio ha finalizado. ¡Gracias por confiar en nosotros!",
  [SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED]:
    "Pago de {amount} recibido para la factura {invoice_number}. ¡Muchas gracias!",
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
