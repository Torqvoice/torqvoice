/**
 * Tests for merging three channels into one paginated list.
 *
 * Pagination here is keyset, across sources that are queried separately, which
 * is where conversations go missing quietly: a wrong cursor drops everything
 * older than the shortest channel, and a cursor that never turns null makes the
 * list scroll forever. Neither shows up in a database with ten rows.
 */

import { describe, it, expect } from 'vitest'
import { mergeChannelPages } from '@/features/messaging/Lib/mergeChannelPages'
import type { InboxThread } from '@/features/messaging/Actions/inboxActions'

function thread(channel: InboxThread['channel'], minutesAgo: number): InboxThread {
  const at = new Date(Date.UTC(2026, 7, 21, 12, 0, 0) - minutesAgo * 60_000)
  return {
    key: `${channel}:${minutesAgo}`,
    channel,
    customerId: `c${minutesAgo}`,
    name: `Customer ${minutesAgo}`,
    contact: '+4915112345678',
    lastMessage: 'hello',
    lastDirection: 'inbound',
    lastAt: at.toISOString(),
  }
}

describe('mergeChannelPages', () => {
  it('interleaves the channels by recency rather than grouping them', () => {
    const merged = mergeChannelPages(
      [[thread('sms', 10), thread('sms', 30)], [thread('whatsapp', 20)], []],
      10
    )
    expect(merged.threads.map((t) => t.channel)).toEqual(['sms', 'whatsapp', 'sms'])
  })

  it('stops at the page size and continues from the oldest row shown', () => {
    const merged = mergeChannelPages(
      [
        [thread('sms', 1), thread('sms', 4)],
        [thread('whatsapp', 2), thread('whatsapp', 5)],
      ],
      2
    )
    expect(merged.threads).toHaveLength(2)
    expect(merged.nextCursor).toBe(merged.threads[1].lastAt)
  })

  it('ends the list when every channel came back short', () => {
    const merged = mergeChannelPages([[thread('sms', 1)], [thread('whatsapp', 2)]], 30)
    expect(merged.nextCursor).toBeNull()
  })

  it('keeps paging while one channel filled its page, even if the merge did not', () => {
    // Two of three channels are exhausted; the third still has more to give.
    const merged = mergeChannelPages([[thread('sms', 1), thread('sms', 2)], [], []], 2)
    expect(merged.nextCursor).not.toBeNull()
  })

  it('has nothing to continue from when there is nothing at all', () => {
    const merged = mergeChannelPages([[], [], []], 30)
    expect(merged.threads).toEqual([])
    expect(merged.nextCursor).toBeNull()
  })

  it('hands back a cursor strictly older than every row shown', () => {
    const merged = mergeChannelPages([[thread('sms', 1), thread('sms', 2), thread('sms', 3)]], 2)
    const shown = merged.threads.map((t) => t.lastAt)
    // The next page asks for rows older than this, so it must equal the last
    // row shown: anything newer would skip a conversation.
    expect(merged.nextCursor).toBe(shown[shown.length - 1])
  })
})
