import type {
  FaultCodeOwnWaveform,
  FaultCodeReportReason,
  FaultCodeResearch,
  FaultCodeSectionKind,
  FaultCodeWaveform,
} from '@/features/integrations/Lib/types'

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
/**
 * One meaning of a make's own code as its page shows it: our title and text
 * when written, BMW's own words always, and where BMW uses it.
 */
export interface OemMeaningView {
  id: string
  /** Our title, else the make's text (its English where the reader reads English). */
  title: string
  titleLang: string
  /** Whether `title` is ours; the make's own text then reads under it. */
  ownTitle: boolean
  /** The make's text as its units give it, and its language. */
  text: string
  textLang: string
  textEn: string | null
  description: string | null
  sections: FaultCodeSection[]
  causes: { key: string; likelihood: 'low' | 'medium' | 'high'; label: string }[]
  modules: { ref: string; family: string | null; name: string | null }[]
  vehicles: {
    chassis: string
    model: string | null
    body: string | null
    yearFrom: number | null
    yearTo: number | null
  }[]
  engines: string[]
  /** One of its units fits the job's car. */
  matches: boolean
}

/** What a make's own code adds to a code's page: its make and every meaning. */
export interface OemPageData {
  /** The make's data the code is from ("bmw") and how people write it ("BMW"). */
  make: string
  makeName: string
  /** The code as shared fixes keep it: BMW-2A82. */
  fixCode: string
  /** The service serves this make's codes (it may still not know this one). */
  served: boolean
  /** The meaning fitting the car first. */
  meanings: OemMeaningView[]
}

/** A make's code in a search: where it opens, and the meaning to name it by. */
export interface OemSearchHit {
  make: string
  makeName: string
  code: string
  title: string
  /** How many meanings it has; the title is the first. */
  meanings: number
}

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
  /** For a make's own code, the meaning the fix is for; null when it is for the code as a whole. */
  meaning: string | null
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
  /** The makes whose own codes the service serves ("bmw"), for what the page says it covers. */
  oemMakes?: string[]
  /** Only on a make's own code (BMW's 2A82). */
  oem?: OemPageData
  /** On the code's own page: whether research can be asked for, and each meaning's research. */
  research?: ResearchState | null
  /** On the code's own page: shared scope recordings. */
  waveforms?: CodeWaveforms | null
  /** Makes that give an OBD-shaped code a meaning of their own (Ford's P1000), the car's first. */
  makeCodes?: OemSearchHit[]
}

/**
 * Waveforms on a code's page: whether the service could be asked, the published ones, and
 * this workshop's own with how their review stands.
 */
export interface CodeWaveforms {
  available: boolean
  published: FaultCodeWaveform[]
  own: FaultCodeOwnWaveform[]
}

/** Researched fixes on a code's page: whether one can be asked for, and those there are. */
export interface ResearchState {
  available: boolean
  items: FaultCodeResearch[]
}
