import { afterEach, describe, expect, it } from 'vitest'
import {
  isActiveConversation,
  setActiveConversation,
} from '@/features/messaging/activeConversation'

describe('active conversation', () => {
  afterEach(() => setActiveConversation(null))

  it('knows nothing until a thread registers', () => {
    expect(isActiveConversation('/messages?customerId=c1')).toBe(false)
    expect(isActiveConversation(null)).toBe(false)
  })

  it('answers for every link the open thread registered, and no other', () => {
    setActiveConversation([
      '/messages?channel=email&customerId=c1',
      '/messages?channel=email&contact=ann%40example.com',
    ])
    expect(isActiveConversation('/messages?channel=email&customerId=c1')).toBe(true)
    expect(isActiveConversation('/messages?channel=email&contact=ann%40example.com')).toBe(true)
    expect(isActiveConversation('/messages?customerId=c1')).toBe(false)
  })

  it('forgets the thread when it closes', () => {
    setActiveConversation(['/messages?customerId=c1'])
    setActiveConversation(null)
    expect(isActiveConversation('/messages?customerId=c1')).toBe(false)
  })
})
