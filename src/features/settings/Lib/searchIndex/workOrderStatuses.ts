import type { SettingsEntry } from './types'

/**
 * Work order statuses. The page renders WorkOrderStatusSettings from
 * src/features/work-order-statuses; the card and the quick-add row carry ids
 * there. Name, colour and notify live in the add/edit dialog, so those
 * entries land on the card that opens it.
 */
export const workOrderStatusesEntries: SettingsEntry[] = [
  {
    id: 'workOrderStatuses.stages',
    page: 'workOrderStatuses',
    title: 'workOrderStatuses.cardTitle',
    description: 'workOrderStatuses.description',
    anchor: 'work-order-statuses-stages',
    keywords: ['work order status', 'job status', 'custom status', 'stages', 'workflow', 'steps'],
  },
  {
    id: 'workOrderStatuses.add',
    page: 'workOrderStatuses',
    title: 'workOrderStatuses.add',
    anchor: 'work-order-statuses-stages',
    keywords: ['add status', 'new status', 'create status', 'custom status'],
  },
  {
    id: 'workOrderStatuses.quickAdd',
    page: 'workOrderStatuses',
    title: 'workOrderStatuses.suggestionsLabel',
    anchor: 'work-order-statuses-quick-add',
    keywords: [
      'quick add',
      'suggested statuses',
      'ready for pickup',
      'waiting for customer',
      'waiting for approval',
      'waiting for parts',
    ],
  },
  {
    id: 'workOrderStatuses.notify',
    page: 'workOrderStatuses',
    title: 'workOrderStatuses.notify',
    description: 'workOrderStatuses.notifyHint',
    anchor: 'work-order-statuses-stages',
    keywords: [
      'notify customer',
      'status message',
      'sms when ready',
      'tell the customer',
      'status notification',
    ],
  },
  {
    id: 'workOrderStatuses.message',
    page: 'workOrderStatuses',
    title: 'workOrderStatuses.message',
    anchor: 'work-order-statuses-stages',
    keywords: ['status message', 'message template', 'customer message', 'pickup message'],
  },
  {
    id: 'workOrderStatuses.color',
    page: 'workOrderStatuses',
    title: 'workOrderStatuses.color',
    anchor: 'work-order-statuses-stages',
    keywords: ['status color', 'status colour', 'badge color', 'label color'],
  },
  {
    id: 'workOrderStatuses.stage',
    page: 'workOrderStatuses',
    title: 'workOrderStatuses.stage',
    anchor: 'work-order-statuses-stages',
    keywords: ['stage', 'pending', 'in progress', 'completed', 'open job'],
  },
]
