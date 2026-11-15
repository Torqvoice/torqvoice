import type { PortalHomeData, PortalHomeFormat, PortalHomeJob } from '../../Lib/homeTypes'

/**
 * The words every theme's Home says the same way: which sentence the home
 * opens with, and the three steps of a job. A theme sets them in its own
 * type; it does not decide what they say.
 *
 * `t` is `getTranslations('portal.home')`.
 */
type Translate = (key: string, values?: Record<string, string | number>) => string

/**
 * The sentence the home opens with, about `data.jobs[0]` when there is one:
 * "Hi Kari. Your car is in the workshop, ready today around 16:00." A promise
 * whose day has passed is left out rather than repeated. With no job it says
 * nothing is in the workshop.
 */
export function portalHeroLine(
  data: PortalHomeData,
  format: PortalHomeFormat,
  t: Translate
): string {
  const name = data.customerFirstName
  const key = (base: string) => (data.marine ? `${base}Marine` : base)
  const job = data.jobs[0]
  if (!job) return t('heroNothing', { name })
  if (job.stage === 'ready') return t(key('heroReady'), { name })
  if (job.stage === 'working') {
    if (job.promisedAt && !format.isPast(job.promisedAt)) {
      return t(key('heroWorkingPromised'), {
        name,
        day: format.relativeDay(job.promisedAt),
        time: format.time(job.promisedAt),
      })
    }
    return t(key('heroWorking'), { name })
  }
  if (job.startAt && !format.isPast(job.startAt)) {
    return t(key('heroBookedAt'), {
      name,
      day: format.relativeDay(job.startAt),
      time: format.time(job.startAt),
    })
  }
  return t('heroBooked', { name })
}

export interface PortalJobStep {
  label: string
  /** 'done' is behind the job, 'now' is where it is, 'todo' is still to come. */
  state: 'done' | 'now' | 'todo'
}

/** The three steps of a job, in order, with where it stands. */
export function portalJobSteps(job: PortalHomeJob, t: Translate): PortalJobStep[] {
  const at = job.stage === 'booked' ? 0 : job.stage === 'working' ? 1 : 2
  const state = (index: number): PortalJobStep['state'] =>
    index < at ? 'done' : index === at ? 'now' : 'todo'
  return [
    { label: at === 0 ? t('stepBooked') : t('stepCheckedIn'), state: state(0) },
    { label: t('stepWorking'), state: state(1) },
    { label: t('stepReady'), state: state(2) },
  ]
}

/** One quiet line about a job that is not the one the home leads with. */
export function portalJobLine(job: PortalHomeJob, format: PortalHomeFormat, t: Translate): string {
  if (job.stage === 'ready') return t('stepReady')
  if (job.stage === 'working') {
    return job.promisedAt && !format.isPast(job.promisedAt)
      ? t('jobReadyAround', {
          day: format.relativeDay(job.promisedAt),
          time: format.time(job.promisedAt),
        })
      : t('stepWorking')
  }
  return job.startAt
    ? t('jobBookedFor', { day: format.day(job.startAt), time: format.time(job.startAt) })
    : t('stepBooked')
}

/** Which "… tyres stored with us" heading a season gets. */
export function tireSeasonKey(season: string, prefix: 'tiresStored' | 'tiresSeason'): string {
  const suffix =
    season === 'summer'
      ? 'Summer'
      : season === 'winter'
        ? 'Winter'
        : season === 'all_season'
          ? 'AllSeason'
          : 'Other'
  return `${prefix}${suffix}`
}
