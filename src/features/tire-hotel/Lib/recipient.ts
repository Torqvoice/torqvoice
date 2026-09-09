/** An override address has to be the kind of address the channel delivers to. */
export function recipientFitsChannel(channel: string, recipient: string): boolean {
  if (channel === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
  if (channel === 'sms' || channel === 'whatsapp') return /^\+?[0-9 ()-]{6,20}$/.test(recipient)
  return recipient.length <= 64
}
