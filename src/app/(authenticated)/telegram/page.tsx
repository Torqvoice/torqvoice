import { redirect } from 'next/navigation'

/**
 * Every channel is a tab on the Messages page now. Kept as a redirect because
 * notifications, docs and bookmarks still point here.
 */
export default async function TelegramPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams({ tab: 'telegram' })
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key === 'tab' ? 'channelTab' : key, value)
  }
  redirect(`/messages?${params.toString()}`)
}
