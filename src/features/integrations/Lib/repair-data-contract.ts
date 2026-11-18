/**
 * Names a repair data connector's manifest needs, kept apart from
 * repair-data.ts so that importing a manifest never pulls in the database.
 */

/** The daily check on stored answers, scheduled by each repair data connector. */
export const CHECK_PLAN_JOB = 'repair.checkPlan'
