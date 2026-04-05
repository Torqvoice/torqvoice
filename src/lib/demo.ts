/**
 * Demo-mode utilities.
 *
 * When `DEMO_MODE=true`, actions that would send external messages,
 * invite users, or touch billing/admin-level state are blocked so the
 * public demo instance at demo.torqvoice.com can't be abused.
 *
 * Regular CRUD (customers, vehicles, service records, settings, ...) is
 * intentionally NOT blocked — demo visitors should be able to play with
 * the app. The hourly reset cron reverts their changes.
 */

export const isDemoMode = process.env.DEMO_MODE === "true";

/** Credentials the sign-in page auto-fills. The seed script provisions this user. */
export const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL || "demo@torqvoice.com";
export const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD || "demo";

/**
 * Throws inside a server action when demo mode is active. `withAuth`
 * catches the error and surfaces it as `{ success: false, error }` to
 * the client, which shows it as a toast.
 */
export function demoGuard(): void {
  if (isDemoMode) {
    throw new Error("This action is disabled on the demo. Install Torqvoice on your own server to use it.");
  }
}
