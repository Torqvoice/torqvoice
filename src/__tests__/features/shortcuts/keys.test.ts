import { describe, expect, it } from 'vitest'
import {
  comboParts,
  combosFromEvent,
  comboText,
  isReservedCombo,
} from '@/features/shortcuts/Lib/keys'

type Press = Partial<
  Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
> & { altGraph?: boolean }

function press({ altGraph, ...init }: Press) {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
    getModifierState: (name: string) => name === 'AltGraph' && !!altGraph,
  }
}

describe('reading a key press', () => {
  it('reads Alt+W and Alt+Shift+W on Windows and Linux', () => {
    expect(combosFromEvent(press({ key: 'w', altKey: true }), 'other')).toEqual(['alt+w'])
    expect(combosFromEvent(press({ key: 'W', altKey: true, shiftKey: true }), 'other')).toEqual([
      'alt+shift+w',
    ])
  })

  it('reads Control as the Alt of a Mac, and still lets Ctrl+K mean search there', () => {
    expect(combosFromEvent(press({ key: 'w', ctrlKey: true }), 'mac')).toEqual(['alt+w', 'mod+w'])
    expect(combosFromEvent(press({ key: 'k', metaKey: true }), 'mac')).toEqual(['mod+k'])
  })

  it('never treats Option on a Mac as a shortcut, because it types characters', () => {
    expect(combosFromEvent(press({ key: '∑', code: 'KeyW', altKey: true }), 'mac')).toEqual([])
  })

  it('ignores AltGr, which types @ and € on European keyboards', () => {
    expect(
      combosFromEvent(
        press({ key: '@', code: 'KeyQ', ctrlKey: true, altKey: true, altGraph: true }),
        'other'
      )
    ).toEqual([])
    expect(combosFromEvent(press({ key: 'q', ctrlKey: true, altKey: true }), 'other')).toEqual([])
  })

  it('goes by the letter printed on the key, wherever the layout puts it', () => {
    // AZERTY: the key printed W sits where a US keyboard has Z.
    expect(combosFromEvent(press({ key: 'w', code: 'KeyZ', altKey: true }), 'other')).toEqual([
      'alt+w',
    ])
  })

  it('finds the slash whether it is its own key or Shift+7', () => {
    const us = press({ key: '/', code: 'Slash', ctrlKey: true })
    const norwegian = press({ key: '/', code: 'Digit7', ctrlKey: true, shiftKey: true })
    expect(combosFromEvent(us, 'other')).toEqual(['mod+/'])
    expect(combosFromEvent(norwegian, 'other')).toEqual(['mod+/'])
  })

  it('falls back to where the key sits on a keyboard with no Latin letters', () => {
    expect(combosFromEvent(press({ key: 'ц', code: 'KeyW', altKey: true }), 'other')).toEqual([
      'alt+w',
    ])
  })

  it('makes nothing of a modifier pressed on its own', () => {
    expect(combosFromEvent(press({ key: 'Alt', altKey: true }), 'other')).toEqual([])
    expect(combosFromEvent(press({ key: 'Shift', shiftKey: true }), 'other')).toEqual([])
  })

  it('treats Caps Lock letters as the plain letter', () => {
    expect(combosFromEvent(press({ key: 'D' }), 'other')).toEqual(['d'])
  })
})

describe('showing a key', () => {
  it('draws Ctrl and Alt on Windows and Linux', () => {
    expect(comboParts('mod+shift+l', 'other')).toEqual(['Ctrl', 'Shift', 'L'])
    expect(comboText('alt+w', 'other')).toBe('Alt+W')
  })

  it('draws Command and Control on a Mac', () => {
    expect(comboParts('mod+k', 'mac')).toEqual(['⌘', 'K'])
    expect(comboParts('alt+w', 'mac')).toEqual(['⌃', 'W'])
    expect(comboParts('mod+shift+l', 'mac')).toEqual(['⌘', '⇧', 'L'])
  })

  it('draws arrows as arrows', () => {
    expect(comboParts('arrowright', 'other')).toEqual(['→'])
  })

  it('reads a sequence as one key, then the next', () => {
    expect(comboText('alt+g alt+w', 'other', 'then')).toBe('Alt+G then Alt+W')
    expect(comboText('alt+g alt+w', 'mac', 'then')).toBe('⌃ G then ⌃ W')
  })
})

describe('keys that cannot be taken', () => {
  it.each([
    'mod+w',
    'mod+q',
    'mod+n',
    'mod+t',
    'mod+c',
    'alt+d',
    'alt+f',
    'alt+e',
    'alt+v',
    'alt+shift+w',
    'alt+shift+k',
    'tab',
    'enter',
    'escape',
  ])('refuses %s', (combo) => {
    expect(isReservedCombo(combo)).toBe(true)
  })

  it.each(['alt+w', 'alt+k', 'mod+k', 'mod+/', 'd', 'arrowright'])('allows %s', (combo) => {
    expect(isReservedCombo(combo)).toBe(false)
  })
})
