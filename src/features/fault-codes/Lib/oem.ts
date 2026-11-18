import type { FaultCodeDetailView, OemMeaningView } from './types'

/** One meaning of a make's code in the shape every code page reads. */
export function oemDetail(
  code: string,
  makeName: string,
  meaning: OemMeaningView | null
): FaultCodeDetailView {
  return {
    code,
    state: meaning ? 'found' : 'unknown',
    range: 'manufacturer',
    title: meaning?.title ?? null,
    source: meaning ? 'manufacturer' : null,
    make: makeName,
    lang: meaning?.titleLang ?? null,
    machineTranslated: false,
    verified: false,
    version: null,
    flags: null,
    description: meaning?.description ?? null,
    sections: meaning?.sections ?? [],
    causes: meaning?.causes ?? [],
    related: [],
    pendingCheck: false,
  }
}

/** "3 Series" with its chassis codes and the years they span. */
export interface ModelLine {
  model: string
  chassis: string[]
  from: number | null
  /** Null while a chassis of it is still built ("from 2018"). */
  to: number | null
}

/** A meaning's vehicles as models with their years; chassis our reference does not know, apart. */
export function modelLines(vehicles: OemMeaningView['vehicles']): {
  lines: ModelLine[]
  other: string[]
} {
  const byModel = new Map<string, ModelLine & { open: boolean }>()
  const other: string[] = []
  for (const v of vehicles) {
    if (!v.model) {
      other.push(v.chassis)
      continue
    }
    const line = byModel.get(v.model) ?? {
      model: v.model,
      chassis: [],
      from: null,
      to: null,
      open: false,
    }
    line.chassis.push(v.chassis)
    if (v.yearFrom !== null) line.from = Math.min(line.from ?? v.yearFrom, v.yearFrom)
    if (v.yearTo !== null) line.to = Math.max(line.to ?? v.yearTo, v.yearTo)
    if (v.yearFrom !== null && v.yearTo === null) line.open = true
    byModel.set(v.model, line)
  }
  const lines = [...byModel.values()].map(({ open, ...line }) => ({
    ...line,
    to: open ? null : line.to,
  }))
  return { lines, other }
}
