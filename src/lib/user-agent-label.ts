/**
 * Plain-words names for a browser or phone, from its user agent. Pure, so the
 * signed-in devices list (server) and a new passkey's name (browser) say the
 * same thing about the same device.
 */

/**
 * "Chrome on Windows", "Safari on iPhone": enough for a person to recognise
 * their own device in a mail or a list, from a user agent string. Not a
 * fingerprint; the cookie does that.
 */
export function describeUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ''
  if (!ua) return 'Unknown device'
  if (/Torqvoice|Expo|okhttp|Dart|CFNetwork/i.test(ua) && !/Mozilla/i.test(ua)) {
    return 'Torqvoice technician app'
  }
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null
  if (browser && os) return `${browser} on ${os}`
  return browser ?? os ?? 'Unknown device'
}

export type DeviceKind = 'phone' | 'tablet' | 'desktop' | 'app' | 'unknown'

/** Phone, tablet or computer: which picture to draw beside a session. */
export function classifyUserAgent(userAgent: string | null | undefined): DeviceKind {
  const ua = userAgent ?? ''
  if (!ua) return 'unknown'
  if (/Torqvoice|Expo|okhttp|Dart|CFNetwork/i.test(ua) && !/Mozilla/i.test(ua)) return 'app'
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return 'tablet'
  }
  if (/iPhone|iPod|Android|Mobile|Windows Phone/i.test(ua)) return 'phone'
  if (/Windows|Macintosh|Mac OS X|CrOS|Linux|X11/i.test(ua)) return 'desktop'
  return 'unknown'
}
