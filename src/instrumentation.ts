export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const {
      checkLicenses,
      checkSubscriptions,
      processRecurringInvoices,
      cleanupPortalSessions,
      cleanupAuditLogs,
      processReportSchedules,
      processWebhookDeliveries,
      cleanupWebhookDeliveries,
      startDemoResetCron,
      checkLowStock,
      checkDueReminders,
      processScheduledMessages,
      checkCustomerReminders,
    } = await import('./cronTasks')
    checkLicenses()
    checkSubscriptions()
    processRecurringInvoices()
    cleanupPortalSessions()
    cleanupAuditLogs()
    processReportSchedules()
    startDemoResetCron()
    processWebhookDeliveries()
    cleanupWebhookDeliveries()
    checkLowStock()
    checkDueReminders()
    processScheduledMessages()
    checkCustomerReminders()
  }
}
