/**
 * Example payloads shown in the events reference panel. These mirror the
 * shape produced by `dispatchWebhookEvent` so integrators can stub their
 * receivers against realistic input.
 */

export type SamplePayload = {
  event: string;
  description: string;
  data: Record<string, unknown>;
};

export const SAMPLE_PAYLOADS: SamplePayload[] = [
  {
    event: "customer.create",
    description: "A new customer was added to your workshop.",
    data: { id: "cus_1aB2cD3eF4", name: "Acme Logistics" },
  },
  {
    event: "vehicle.create",
    description: "A vehicle was registered against a customer.",
    data: { id: "veh_8K9L0", licensePlate: "AB12345", make: "Volvo", model: "FH16" },
  },
  {
    event: "service.status",
    description: "A work-order status changed (e.g. → completed, ready).",
    data: { id: "svc_R8c9", status: "completed", previousStatus: "in_progress" },
  },
  {
    event: "payment.create",
    description: "A payment was recorded against an invoice.",
    data: { id: "pmt_zX1y", invoiceId: "svc_R8c9", amount: 12500, currency: "NOK", method: "card" },
  },
  {
    event: "quote.status",
    description: "A quote moved between draft / sent / accepted / declined.",
    data: { id: "quo_44A", status: "accepted" },
  },
  {
    event: "inspection.complete",
    description: "A digital inspection was submitted for a vehicle.",
    data: { id: "ins_77B", vehicleId: "veh_8K9L0", findings: 2 },
  },
  {
    event: "ping.test",
    description: "Sent by the “Send test” button in the settings page.",
    data: { test: true },
  },
];

export function buildSampleEnvelope(sample: SamplePayload) {
  return {
    id: "evt_2k0r6h6f7g4z",
    event: sample.event,
    createdAt: "2026-04-29T10:00:00.000Z",
    organizationId: "org_4nFgYkM",
    entity: sample.event.split(".")[0],
    entityId: sample.data.id ?? null,
    message: null,
    userId: "usr_3K8qP1",
    data: sample.data,
  };
}
