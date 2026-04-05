export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkLicenses, checkSubscriptions, processRecurringInvoices, cleanupPortalSessions, cleanupAuditLogs, processReportSchedules, startDemoResetCron } = await import('./cronTasks')
    checkLicenses()
    checkSubscriptions()
    processRecurringInvoices()
    cleanupPortalSessions()
    cleanupAuditLogs()
    processReportSchedules()
    startDemoResetCron()
  }
}
