import { useState, useEffect, useCallback, useRef } from "react";

/**
 * A cooldown timer that persists across page refreshes via localStorage.
 * Returns [secondsRemaining, startCooldown].
 *
 * Initializes to 0 on the server to avoid hydration mismatches,
 * then reads the persisted expiry from localStorage after mount.
 */
export function useCooldown(
  key: string,
  durationSeconds: number,
): [number, () => void] {
  const storageKey = `cooldown:${key}`;
  const [remaining, setRemaining] = useState(0);
  const mountedRef = useRef(false);

  const getRemaining = useCallback(() => {
    const expiresAt = localStorage.getItem(storageKey);
    if (!expiresAt) return 0;
    const r = Math.ceil((Number(expiresAt) - Date.now()) / 1000);
    return r > 0 ? r : 0;
  }, [storageKey]);

  // Read persisted cooldown after mount
  useEffect(() => {
    mountedRef.current = true;
    setRemaining(getRemaining());
  }, [getRemaining]);

  // Tick down every second
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => {
      const r = getRemaining();
      setRemaining(r);
      if (r <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [remaining, getRemaining]);

  const start = useCallback(() => {
    const expiresAt = Date.now() + durationSeconds * 1000;
    localStorage.setItem(storageKey, String(expiresAt));
    setRemaining(durationSeconds);
  }, [storageKey, durationSeconds]);

  return [remaining, start];
}
