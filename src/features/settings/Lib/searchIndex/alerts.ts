import type { SettingsEntry } from './types'

/**
 * Alerts. Three cards with ids of their own; the switches and inputs carry
 * theirs. Fields under a switch only render once it is on.
 */
export const alertsEntries: SettingsEntry[] = [
  {
    id: 'alerts.technicianStatus',
    page: 'alerts',
    title: 'alerts.technicianStatus.title',
    description: 'alerts.technicianStatus.description',
    anchor: 'alerts-technician-status',
    keywords: ['technician app', 'mobile app', 'android', 'ios', 'phone app', 'job moved'],
  },
  {
    id: 'alerts.technicianStatusInApp',
    page: 'alerts',
    title: 'alerts.technicianStatus.inApp',
    description: 'alerts.technicianStatus.inAppHint',
    anchor: 'technicianStatus',
    keywords: [
      'notify the desk',
      'job finished notification',
      'technician notification',
      'status alert',
    ],
  },
  {
    id: 'alerts.serviceRequest',
    page: 'alerts',
    title: 'alerts.serviceRequest.title',
    description: 'alerts.serviceRequest.description',
    anchor: 'alerts-service-request',
    keywords: [
      'service request',
      'portal request',
      'booking request',
      'customer portal',
      'new request alert',
    ],
  },
  {
    id: 'alerts.serviceRequestEmail',
    page: 'alerts',
    title: 'alerts.serviceRequest.email',
    description: 'alerts.serviceRequest.emailHint',
    anchor: 'serviceRequestEmail',
    keywords: ['service request email', 'email notification', 'email alert', 'request email'],
  },
  {
    id: 'alerts.serviceRequestRecipients',
    page: 'alerts',
    title: 'alerts.serviceRequest.recipients',
    description: 'alerts.serviceRequest.recipientsHint',
    anchor: 'serviceRequestRecipients',
    keywords: ['alert recipients', 'send to', 'notification email address', 'who gets alerts'],
  },
  {
    id: 'alerts.lowStock',
    page: 'alerts',
    title: 'alerts.lowStock.title',
    description: 'alerts.lowStock.description',
    anchor: 'alerts-low-stock',
    keywords: ['low stock', 'reorder', 'parts need reordering', 'out of stock', 'inventory alert'],
  },
  {
    id: 'alerts.lowStockEnabled',
    page: 'alerts',
    title: 'alerts.lowStock.enable',
    description: 'alerts.lowStock.enableHint',
    anchor: 'lowStockEnabled',
    keywords: ['enable low stock alerts', 'stock alerts', 'turn on reorder alerts'],
  },
  {
    id: 'alerts.lowStockThreshold',
    page: 'alerts',
    title: 'alerts.lowStock.defaultThreshold',
    description: 'alerts.lowStock.defaultThresholdHint',
    anchor: 'lowStockThreshold',
    keywords: ['reorder point', 'min qty', 'minimum quantity', 'stock threshold', 'reorder level'],
  },
  {
    id: 'alerts.lowStockInApp',
    page: 'alerts',
    title: 'alerts.lowStock.inApp',
    description: 'alerts.lowStock.inAppHint',
    anchor: 'lowStockInApp',
    keywords: ['in-app notification', 'notification bell', 'low stock notification'],
  },
  {
    id: 'alerts.lowStockEmail',
    page: 'alerts',
    title: 'alerts.lowStock.email',
    description: 'alerts.lowStock.emailHint',
    anchor: 'lowStockEmail',
    keywords: ['email digest', 'low stock email', 'reorder email'],
  },
  {
    id: 'alerts.lowStockInterval',
    page: 'alerts',
    title: 'alerts.lowStock.emailInterval',
    description: 'alerts.lowStock.emailIntervalHint',
    anchor: 'lowStockInterval',
    keywords: ['email interval', 'hours between emails', 'digest frequency', 'email limit'],
  },
  {
    id: 'alerts.lowStockCheckNow',
    page: 'alerts',
    title: 'alerts.lowStock.checkNow',
    anchor: 'alerts-low-stock-check-now',
    keywords: ['check stock now', 'run low stock check', 'test alerts'],
  },
]
