import type { SettingsEntry } from './types'

/** Keyboard shortcuts: the person's own keys, saved to their account. */
export const shortcutsEntries: SettingsEntry[] = [
  {
    id: 'shortcuts.enable',
    page: 'shortcuts',
    title: 'shortcuts.enableLabel',
    description: 'shortcuts.enableHint',
    anchor: 'shortcuts-enabled',
    keywords: ['hotkeys', 'keyboard', 'keys', 'turn off shortcuts', 'disable shortcuts'],
  },
  {
    id: 'shortcuts.singleKeys',
    page: 'shortcuts',
    title: 'shortcuts.singleKeysLabel',
    description: 'shortcuts.singleKeysHint',
    anchor: 'shortcuts-single-keys',
    keywords: ['single key', 'letter keys', 'voice control', 'accessibility', 'calendar keys'],
  },
  {
    id: 'shortcuts.goToSequences',
    page: 'shortcuts',
    title: 'shortcuts.goToSequencesLabel',
    description: 'shortcuts.goToSequencesHint',
    anchor: 'shortcuts-go-to-sequences',
    // Plain words: search has no keyboard to hand, so it names the Windows keys.
    values: { prefix: 'Alt+G', example: 'Alt+G, Alt+W', workOrders: 'Work orders' },
    keywords: ['alt g', 'go to page', 'navigation keys', 'open page', 'sequence', 'jump to'],
  },
  {
    id: 'shortcuts.all',
    page: 'shortcuts',
    title: 'shortcuts.allTitle',
    description: 'shortcuts.allHint',
    anchor: 'shortcuts-all',
    keywords: [
      'change shortcut',
      'rebind',
      'key binding',
      'keybinding',
      'hotkey',
      'customize keys',
      'reset shortcuts',
      'new work order key',
    ],
  },
]
