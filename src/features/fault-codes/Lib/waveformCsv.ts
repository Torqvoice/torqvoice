import type { WaveformPreview } from '@/features/integrations/Lib/types'

/**
 * A scope's CSV export drawn small, read in the browser the moment it is dropped, so the
 * technician sees the waveform before sharing it. The same reading as the code service's
 * (crates/core/src/waveform.rs), which draws the one other workshops see: a header row, an
 * optional units row ("(ms),(V)"), the samples cut into equal time slices with each channel's
 * lowest and highest value per slice. `;` or tab between values means a decimal comma.
 */
export const PREVIEW_SLICES = 400
const MAX_CHANNELS = 8

function cells(line: string, sep: string): string[] {
  return line.split(sep).map((c) =>
    c
      .trim()
      .replace(/^"+|"+$/g, '')
      .trim()
  )
}

function number(cell: string | undefined, decimalComma: boolean): number | null {
  if (cell === undefined || cell === '') return null
  const value = Number(decimalComma ? cell.replace(',', '.') : cell)
  return Number.isFinite(value) ? value : null
}

/** The preview of a CSV export, or null when it is not one. */
export function previewCsv(text: string): WaveformPreview | null {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
  const header = lines.shift()
  if (!header) return null
  const sep = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ','
  const decimalComma = sep !== ','
  const names = cells(header, sep)
  if (names.length < 2) return null

  let units: string[] = []
  if (lines[0]?.startsWith('(') || lines[0]?.startsWith('"(')) {
    units = cells(lines.shift() as string, sep).map((c) => c.replace(/^\(/, '').replace(/\)$/, ''))
  }
  const count = Math.min(names.length - 1, MAX_CHANNELS)
  const times: number[] = []
  const values: (number | null)[][] = []
  for (const row of lines) {
    const c = cells(row, sep)
    const t = number(c[0], decimalComma)
    if (t === null) continue
    times.push(t)
    values.push(Array.from({ length: count }, (_, i) => number(c[i + 1], decimalComma)))
  }
  if (times.length < 2) return null
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  for (const t of times) {
    if (t < start) start = t
    if (t > end) end = t
  }
  if (!(end > start)) return null

  const min = Array.from({ length: count }, () =>
    new Array<number | null>(PREVIEW_SLICES).fill(null)
  )
  const max = Array.from({ length: count }, () =>
    new Array<number | null>(PREVIEW_SLICES).fill(null)
  )
  for (let i = 0; i < times.length; i++) {
    const slice = Math.min(
      PREVIEW_SLICES - 1,
      Math.floor(((times[i] - start) / (end - start)) * PREVIEW_SLICES)
    )
    for (let ch = 0; ch < count; ch++) {
      const v = values[i][ch]
      if (v === null) continue
      const lo = min[ch][slice]
      const hi = max[ch][slice]
      min[ch][slice] = lo === null ? v : Math.min(lo, v)
      max[ch][slice] = hi === null ? v : Math.max(hi, v)
    }
  }
  const channels = []
  for (let ch = 0; ch < count; ch++) {
    if (!min[ch].some((v) => v !== null)) continue
    channels.push({ name: names[ch + 1], unit: units[ch + 1] ?? '', min: min[ch], max: max[ch] })
  }
  if (channels.length === 0) return null
  return { timeUnit: units[0] ?? '', start, end, channels }
}

/** Which part of a shared waveform a dropped file is, by its name; null when none. */
export function waveformRole(
  name: string,
  type: string
): 'psdata' | 'pssettings' | 'csv' | 'image' | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.psdata')) return 'psdata'
  if (lower.endsWith('.pssettings')) return 'pssettings'
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv'
  if (type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/.test(lower))
    return 'image'
  return null
}
