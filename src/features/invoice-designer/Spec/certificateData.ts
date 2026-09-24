/**
 * What a certificate prints beyond the fields every document has: the
 * outcome of the test, the checks that failed, every check by section, the
 * photographs, and who signed it. Worded and coloured by whoever builds it,
 * so the blocks stay free of grading rules and translations.
 */

export interface CertificateColor {
  bg: string
  text: string
}

export interface CertificateDefect {
  /** The regulation reference, when the checklist has one. */
  code: string | null
  name: string
  /** The grade as it is printed: "2 — Major defect". */
  grade: string
  color: CertificateColor
  notes: string | null
  /** Data URIs, already sized for the page. */
  photos: string[]
}

export interface CertificateResultRow {
  code: string | null
  name: string
  grade: string
  notes: string | null
  /** Which kind of row this is, so a design can leave some out. */
  kind: 'pass' | 'defect' | 'not_applicable'
}

export interface CertificateData {
  result: {
    label: string
    detail: string
    color: CertificateColor
  }
  /** "12 passed · 1 minor defect", already worded. */
  summary: string
  defects: CertificateDefect[]
  /** Every graded check, section by section, in checklist order. */
  sections: { code: string | null; name: string; rows: CertificateResultRow[] }[]
  /** Photographs of the vehicle as a whole, with the captions the desk gave them. */
  photos: { dataUri: string; caption: string | null }[]
  signature: { inspector: string; date: string }
}
