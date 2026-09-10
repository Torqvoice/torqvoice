/**
 * Background work, started once per Node server.
 *
 * `DISABLE_BACKGROUND_JOBS=1` leaves every timer unstarted, which is what a
 * test harness wants: the schedulers otherwise tick through a run, writing to
 * the same rows the tests are asserting on (the due-reminder scan stamps
 * `notifiedAt`, the message and webhook processors send things) and competing
 * for the one CPU the suite is using. A spec that needs one of these calls the
 * processor itself instead of waiting for its timer.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.DISABLE_BACKGROUND_JOBS === '1') {
      const { warnAboutAppUrl } = await import('./lib/auth-origin-hint')
      warnAboutAppUrl()
      console.warn('[cron] DISABLE_BACKGROUND_JOBS=1, no scheduled work started')
      return
    }
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
      processIntegrationJobs,
      cleanupIntegrationLogs,
    } = await import('./cronTasks')
    const { warnAboutAppUrl } = await import('./lib/auth-origin-hint')
    warnAboutAppUrl()
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
    processIntegrationJobs()
    cleanupIntegrationLogs()
  }
}
