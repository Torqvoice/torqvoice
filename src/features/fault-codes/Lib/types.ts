import type { FaultCodeReportReason, FaultCodeSectionKind } from '@/features/integrations/Lib/types'

/**
 * What the screens get about a code, in one shape. Plain data, so it crosses
 * from a server action to a client component as it is.
 */

/** Where the meaning on screen comes from, as the finding stores it. */
export type MeaningSource = 'generic' | 'manufacturer' | 'report'

export type CodeState =
  /** A meaning to show. */
  | 'found'
  /** The service answered and has no meaning for this code. */
  | 'unknown'
  /** No answer: not connected, or the service did not answer in time. */
  | 'unavailable'

export interface FaultCodeFlags {
  warningLight: boolean
  emissions: boolean
  driveCycle: boolean
  limpMode: boolean
}

export interface FaultCodeView {
  code: string
  state: CodeState
  /** A manufacturer code's meaning depends on the make; a standard one's does not. */
  range: 'standard' | 'manufacturer'
  title: string | null
  source: MeaningSource | null
  /** The make a manufacturer meaning is for. */
  make: string | null
  /** The language the title is in. */
  lang: string | null
  machineTranslated: boolean
  /** A reviewer at the service has checked it. */
  verified: boolean
  /** The version the service gave, sent back with a report. */
  version: number | null
  flags: FaultCodeFlags | null
}

export interface FaultCodeSection {
  kind: FaultCodeSectionKind
  text: string
}

export interface FaultCodeDetailView extends FaultCodeView {
  description: string | null
  /** The description in labelled parts, when the service cuts it so. */
  sections: FaultCodeSection[]
  causes: { key: string; likelihood: 'low' | 'medium' | 'high'; label: string }[]
  related: { code: string; title: string | null }[]
  /** Only the title is served until a person at the service has checked the text. */
  pendingCheck: boolean
}

/** A job in this workshop where the code was read. */
export interface FaultCodeJob {
  findingId: string
  serviceRecordId: string | null
  title: string | null
  vehicleId: string
  vehicle: string
  licensePlate: string | null
  status: string
  faultStatus: string | null
  meaning: string | null
  /** ISO. */
  at: string
}

/** What this workshop reported about a code's meaning, and where that stands. */
export interface ReportState {
  code: string
  reportedAt: string
  reason: FaultCodeReportReason
  status: 'open' | 'resolved'
  outcome: 'fixed' | 'no_change' | 'duplicate' | null
  message: string | null
}

/** The vehicle the codes are read for, as the code sheet names it. */
export interface CodeVehicle {
  id: string
  make: string
  model: string
  year: number
  /** Engine code, or the size when there is no code. */
  engine: string | null
}

/** A photo on a shared fix; the app's photo route serves it. */
export interface FixPhoto {
  n: number
  width: number
  height: number
}

/**
 * What fixed a code, as a workshop shared it: never a plate, VIN, customer
 * or which workshop it was.
 */
export interface SharedFix {
  id: string
  /** The language it was written in. */
  lang: string
  text: string
  vehicle: {
    make: string | null
    model: string | null
    year: number | null
    engine: string | null
  } | null
  photos: FixPhoto[]
  /** ISO. */
  createdAt: string
}

/** A fix this workshop shared, with how the review at Torqvoice stands. */
export interface OwnFix extends SharedFix {
  status: 'pending' | 'published' | 'rejected'
  /** Why it was not published, in the reviewer's words. */
  reason: string | null
  reviewedAt: string | null
}

/** The fixes on a code's page. */
export interface CodeFixes {
  /** The service answered. */
  available: boolean
  /** Published fixes from other workshops, newest first. */
  published: SharedFix[]
  /** This workshop's own, newest first. */
  own: OwnFix[]
}

/** Everything the code sheet and the code page show for one code. */
export interface FaultCodePageData {
  code: string
  /** The workshop has the code service connected. */
  connected: boolean
  /** The code service exists on this install, so it could be connected. */
  connectable: boolean
  /** The service answered this time. */
  available: boolean
  detail: FaultCodeDetailView
  jobs: FaultCodeJob[]
  /** Only on the code's own page; the sheet beside a job leaves them out. */
  fixes: CodeFixes | null
  report: ReportState | null
  vehicle: CodeVehicle | null
}
