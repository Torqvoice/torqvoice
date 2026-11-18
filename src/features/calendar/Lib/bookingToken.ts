/**
 * The token a booking dialog sends with what it books, so the same booking
 * sent twice is booked once (see createBookingOnce).
 *
 * Not `crypto.randomUUID`: a self-hosted workshop on plain http has no
 * secure context, and the browser leaves that function out there.
 * `getRandomValues` is there either way.
 */
export function newBookingToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
