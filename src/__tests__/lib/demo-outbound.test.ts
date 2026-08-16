import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("demo mode blocks every outbound transport", () => {
  beforeEach(() => { vi.resetModules(); process.env.DEMO_MODE = "true"; });
  afterEach(() => { delete process.env.DEMO_MODE; });

  it("refuses email, sms and telegram", async () => {
    const { assertOutboundAllowed } = await import("@/lib/demo");
    for (const ch of ["email", "sms", "telegram"] as const) {
      expect(() => assertOutboundAllowed(ch)).toThrow(/disabled on the demo/);
    }
  });

  it("allows them when demo mode is off", async () => {
    process.env.DEMO_MODE = "false";
    vi.resetModules();
    const { assertOutboundAllowed } = await import("@/lib/demo");
    expect(() => assertOutboundAllowed("email")).not.toThrow();
  });

  it("unlocks the feature set for the demo org", async () => {
    const { getFeatures } = await import("@/lib/features");
    const features = await getFeatures("any-org");
    expect(features.sms).toBe(true);
    expect(features.telegram).toBe(true);
    expect(features.brandingRemoved).toBe(false);
  });

  it("stops the scheduled-message cron before it reads the queue", async () => {
    const { processDueMessages } = await import("@/lib/cron/scheduled-messages");
    expect(await processDueMessages()).toBe(0);
  });
});
