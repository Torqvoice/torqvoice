/**
 * Decision logic for low-stock alerting, kept free of I/O so the anti-spam
 * guarantees can be tested directly.
 *
 * The whole design rests on alerting for a *transition* rather than a *state*.
 * A naive implementation asks "which parts are low?" on every run and alerts on
 * the answer — which means a part sitting at zero for a month produces an alert
 * every single run. Instead each part carries `lowStockAlertedAt`:
 *
 *   - NULL          → armed; a dip below the reorder point will alert once.
 *   - not NULL      → already alerted for this dip; stays silent.
 *
 * The marker is cleared only when stock climbs back *above* the reorder point,
 * so recovering and dipping again is a genuine second event and alerts again.
 */

export interface LowStockCandidate {
  id: string;
  name: string;
  partNumber: string | null;
  quantity: number;
  minQuantity: number;
  lowStockAlertedAt: Date | null;
}

export interface LowStockDecision {
  /** Parts that just crossed below their reorder point — alert on these. */
  newlyLow: LowStockCandidate[];
  /** Parts that recovered; clear their marker so a future dip alerts again. */
  toRearm: string[];
}

/**
 * The reorder point actually in force for a part.
 *
 * A part's own `minQuantity` always wins. When it is unset (0), the
 * organization-wide default applies — without that fallback the feature only
 * covers parts someone remembered to configure individually, which on a real
 * inventory means almost none of them.
 *
 * A default of 0 means "no org-wide threshold", so only explicitly configured
 * parts are watched. That is the out-of-the-box behaviour.
 */
export function effectiveThreshold(
  part: { minQuantity: number },
  defaultThreshold = 0,
): number {
  return part.minQuantity > 0 ? part.minQuantity : Math.max(0, defaultThreshold);
}

/**
 * A part counts as low at or below its effective reorder point.
 *
 * This is the single definition of "low" — the alert engine, the dashboard
 * count, the list badge and the inventory filter all resolve through it (or
 * through SQL mirroring it), so the numbers can never disagree.
 */
export function isLow(
  part: { quantity: number; minQuantity: number },
  defaultThreshold = 0,
): boolean {
  const threshold = effectiveThreshold(part, defaultThreshold);
  return threshold > 0 && part.quantity <= threshold;
}

/**
 * Split parts into "alert now" and "re-arm", based on the transition rules.
 *
 * Deliberately ignores parts that are low and already marked: that silence is
 * the entire point.
 */
export function decideLowStockAlerts(
  parts: readonly LowStockCandidate[],
  defaultThreshold = 0,
): LowStockDecision {
  const newlyLow: LowStockCandidate[] = [];
  const toRearm: string[] = [];

  for (const part of parts) {
    if (isLow(part, defaultThreshold)) {
      // Already alerted for this dip — stay quiet.
      if (part.lowStockAlertedAt === null) newlyLow.push(part);
    } else if (part.lowStockAlertedAt !== null) {
      // Back above the reorder point: arm it for the next dip.
      toRearm.push(part.id);
    }
  }

  return { newlyLow, toRearm };
}

/**
 * Whether a digest email may be sent now.
 *
 * A second, independent throttle to the per-part hysteresis: even if many parts
 * go low in quick succession across separate runs, the mailbox sees at most one
 * message per `minIntervalHours`. In-app notifications are not throttled this
 * way — they are cheap and non-intrusive, and are already deduplicated by the
 * per-part marker.
 */
export function canSendDigestEmail(
  lastSentAt: Date | null,
  now: Date,
  minIntervalHours: number,
): boolean {
  if (!lastSentAt) return true;
  if (minIntervalHours <= 0) return true;
  const elapsedMs = now.getTime() - lastSentAt.getTime();
  return elapsedMs >= minIntervalHours * 60 * 60 * 1000;
}

/** One-line summary per part for the digest body. */
export function formatLowStockLine(
  part: LowStockCandidate,
  defaultThreshold = 0,
): string {
  const ref = part.partNumber ? ` (${part.partNumber})` : "";
  const threshold = effectiveThreshold(part, defaultThreshold);
  return `${part.name}${ref} — ${part.quantity} left, reorder at ${threshold}`;
}

/**
 * Title/message for the single grouped notification. Grouping matters: five
 * parts going low should be one bell item, not five.
 */
export function buildAlertSummary(
  parts: readonly LowStockCandidate[],
  defaultThreshold = 0,
): {
  title: string;
  message: string;
} {
  if (parts.length === 1) {
    const p = parts[0];
    return {
      title: "Low stock",
      message: formatLowStockLine(p, defaultThreshold),
    };
  }

  const preview = parts
    .slice(0, 3)
    .map((p) => p.name)
    .join(", ");
  const remainder = parts.length - Math.min(3, parts.length);

  return {
    title: `${parts.length} parts low on stock`,
    message: remainder > 0 ? `${preview} and ${remainder} more` : preview,
  };
}
