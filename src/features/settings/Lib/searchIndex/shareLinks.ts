import type { SettingsEntry } from './types'

/** Share links. Two cards: the expiry rules, and the list of links handed out. */
export const shareLinksEntries: SettingsEntry[] = [
  {
    id: 'shareLinks.rules',
    page: 'shareLinks',
    title: 'shareLinks.rules.title',
    description: 'shareLinks.rules.description',
    anchor: 'share-links-rules',
    keywords: [
      'link expiry',
      'expire links',
      'share link expires',
      'link lifetime',
      'public link',
      'days after payment',
    ],
  },
  {
    id: 'shareLinks.invoice',
    page: 'shareLinks',
    title: 'shareLinks.rules.kind.invoice',
    description: 'shareLinks.rules.hint.afterPayment',
    anchor: 'share-links-rules',
    keywords: ['invoice link', 'expire after payment', 'paid invoice link', 'pay link'],
  },
  {
    id: 'shareLinks.quote',
    page: 'shareLinks',
    title: 'shareLinks.rules.kind.quote',
    description: 'shareLinks.rules.hint.afterSharing',
    anchor: 'share-links-rules',
    keywords: ['quote link', 'estimate link', 'expire after sending'],
  },
  {
    id: 'shareLinks.inspection',
    page: 'shareLinks',
    title: 'shareLinks.rules.kind.inspection',
    description: 'shareLinks.rules.hint.afterSharing',
    anchor: 'share-links-rules',
    keywords: ['inspection link', 'report link', 'certificate link'],
  },
  {
    id: 'shareLinks.list',
    page: 'shareLinks',
    title: 'shareLinks.list.title',
    description: 'shareLinks.list.description',
    anchor: 'share-links-list',
    keywords: ['active links', 'shared links', 'revoke link', 'remove link', 'expired links'],
  },
]
