import type { SettingsEntry } from './types'

/**
 * Report schedule. The form lives in a dialog opened by the New Schedule
 * button, so its fields land on that button; Send Now sits on each schedule
 * in the list.
 */
export const reportScheduleEntries: SettingsEntry[] = [
  {
    id: 'reportSchedule.new',
    page: 'reportSchedule',
    title: 'reportSchedule.newSchedule',
    description: 'reportSchedule.emptyDescription',
    anchor: 'report-schedule-new',
    keywords: [
      'new schedule',
      'scheduled report',
      'automated reports',
      'email reports',
      'report delivery',
    ],
  },
  {
    id: 'reportSchedule.frequency',
    page: 'reportSchedule',
    title: 'reportSchedule.frequency',
    anchor: 'report-schedule-new',
    keywords: ['report frequency', 'daily report', 'weekly report', 'monthly report', 'how often'],
  },
  {
    id: 'reportSchedule.dateRange',
    page: 'reportSchedule',
    title: 'reportSchedule.dateRangeLabel',
    anchor: 'report-schedule-new',
    keywords: ['report date range', 'report period', 'last 30 days', 'year to date'],
  },
  {
    id: 'reportSchedule.sections',
    page: 'reportSchedule',
    title: 'reportSchedule.sections',
    description: 'reportSchedule.sectionsDescription',
    anchor: 'report-schedule-new',
    keywords: [
      'report sections',
      'revenue report',
      'tax report',
      'past due',
      'parts usage',
      'retention',
    ],
  },
  {
    id: 'reportSchedule.recipients',
    page: 'reportSchedule',
    title: 'reportSchedule.recipients',
    description: 'reportSchedule.recipientsDescription',
    anchor: 'report-schedule-new',
    keywords: ['report recipients', 'who gets the report', 'email report to', 'team members'],
  },
  {
    id: 'reportSchedule.endDate',
    page: 'reportSchedule',
    title: 'reportSchedule.endDate',
    description: 'reportSchedule.endDateDescription',
    anchor: 'report-schedule-new',
    keywords: ['end date', 'stop schedule', 'schedule expiry'],
  },
  {
    id: 'reportSchedule.sendNow',
    page: 'reportSchedule',
    title: 'reportSchedule.sendNow',
    anchor: 'report-schedule-list',
    keywords: ['send report now', 'send now', 'test report', 'run report'],
  },
]
