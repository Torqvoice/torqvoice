import { redirect } from 'next/navigation'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('whatsapp')
}

/**
 * Every channel is a tab on the Messages page now. Kept as a redirect because
 * notifications, docs and bookmarks still point here.
 */
export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams({ tab: 'whatsapp' })
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key === 'tab' ? 'channelTab' : key, value)
  }
  redirect(`/messages?${params.toString()}`)
}
