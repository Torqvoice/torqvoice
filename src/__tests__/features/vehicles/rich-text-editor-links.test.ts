/**
 * A link pasted into a note has to be openable. A plain click in a note
 * being written puts the cursor in the link, so its text can be changed;
 * Ctrl or Cmd with the click opens it. Before this, nothing opened it at all.
 */

import { describe, expect, it } from 'vitest'
import { linkToOpen } from '@/components/ui/rich-text-links'

function clickOn(html: string, keys: { ctrlKey?: boolean; metaKey?: boolean } = {}) {
  const host = document.createElement('div')
  host.innerHTML = html
  const target = host.querySelector('[data-target]') ?? host.firstElementChild
  return { ctrlKey: false, metaKey: false, ...keys, target } as unknown as MouseEvent
}

const LINK = '<p><a href="https://example.com/part/123" data-target>the part</a></p>'

describe('a click on a link in a note', () => {
  it('opens it with Ctrl held', () => {
    expect(linkToOpen(clickOn(LINK, { ctrlKey: true }), true)).toBe('https://example.com/part/123')
  })

  it('opens it with Cmd held, for a Mac', () => {
    expect(linkToOpen(clickOn(LINK, { metaKey: true }), true)).toBe('https://example.com/part/123')
  })

  it('does not open it on a plain click, which is for placing the cursor', () => {
    expect(linkToOpen(clickOn(LINK), true)).toBeNull()
  })

  it('finds the link when the click lands on formatting inside it', () => {
    const bold = '<p><a href="https://example.com/"><strong data-target>bold</strong></a></p>'
    expect(linkToOpen(clickOn(bold, { ctrlKey: true }), true)).toBe('https://example.com/')
  })

  it('does nothing for a Ctrl click on ordinary text', () => {
    expect(linkToOpen(clickOn('<p data-target>plain</p>', { ctrlKey: true }), true)).toBeNull()
  })

  it('leaves a locked note to the browser, which follows the link itself', () => {
    expect(linkToOpen(clickOn(LINK, { ctrlKey: true }), false)).toBeNull()
  })

  it('opens a phone number', () => {
    const phone = '<p><a href="tel:+4712345678" data-target>call</a></p>'
    expect(linkToOpen(clickOn(phone, { ctrlKey: true }), true)).toBe('tel:+4712345678')
  })

  it('opens a mail address, and refuses a script', () => {
    const mail = '<p><a href="mailto:parts@example.com" data-target>mail</a></p>'
    expect(linkToOpen(clickOn(mail, { ctrlKey: true }), true)).toBe('mailto:parts@example.com')
    const script = '<p><a href="javascript:alert(1)" data-target>x</a></p>'
    expect(linkToOpen(clickOn(script, { ctrlKey: true }), true)).toBeNull()
  })
})
