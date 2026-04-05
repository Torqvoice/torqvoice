import { isDemoMode } from "@/lib/demo";

export function DemoBanner() {
  if (!isDemoMode) return null;

  return (
    <div className="bg-amber-500 text-center text-xs font-medium text-amber-950 py-1.5 px-4">
      Demo instance — data resets hourly. Outgoing email, SMS, Telegram and team invites are disabled.{" "}
      <a
        href="https://torqvoice.com/docs/installation"
        className="underline underline-offset-2 hover:text-amber-900"
      >
        Install your own →
      </a>
    </div>
  );
}
