import { describe, expect, it } from 'vitest'
import { PREVIEW_SLICES, previewCsv, waveformRole } from '@/features/fault-codes/Lib/waveformCsv'

/**
 * A scope's CSV export drawn in the browser the moment it is dropped. The same reading as the
 * code service's, so what the technician sees before sharing is what other workshops see.
 */
describe('reading a CSV export', () => {
  it('draws a PicoScope export with its names, units and edges', () => {
    let csv = 'Time,Channel A,Channel B\r\n(ms),(V),(V)\r\n\r\n'
    for (let i = 0; i < 2000; i++) {
      const a = Math.floor(i / 100) % 2 === 0 ? 0 : 5
      csv += `${(i * 0.01).toFixed(5)},${a.toFixed(3)},${Math.sin(i / 300).toFixed(3)}\n`
    }
    const p = previewCsv(csv)
    expect(p?.timeUnit).toBe('ms')
    expect(p?.channels.map((c) => [c.name, c.unit])).toEqual([
      ['Channel A', 'V'],
      ['Channel B', 'V'],
    ])
    expect(p?.channels[0].min).toHaveLength(PREVIEW_SLICES)
    // The square wave's lows and highs both survive the slicing.
    const highs = p?.channels[0].max.filter((v) => v !== null && v > 4.9).length ?? 0
    const lows = p?.channels[0].min.filter((v) => v !== null && v < 0.1).length ?? 0
    expect(highs).toBeGreaterThan(100)
    expect(lows).toBeGreaterThan(100)
  })

  it('reads a European export with decimal commas, past-range values left out', () => {
    const p = previewCsv('Zeit;Kanal A\n(ms);(V)\n\n0,0;1,5\n0,5;∞\n1,0;2,5\n')
    expect(p?.channels[0].name).toBe('Kanal A')
    expect(p?.end).toBe(1)
    expect(p?.channels[0].max.filter((v) => v !== null)).toEqual([1.5, 2.5])
  })

  it('has nothing to draw for a file that is not an export', () => {
    expect(previewCsv('hello')).toBeNull()
    expect(previewCsv('Time,A\n(ms),(V)\n1,2\n')).toBeNull()
    expect(previewCsv('name,price\nbolt,2\n')).toBeNull()
  })
})

describe('sorting a dropped file', () => {
  it('knows each file by its name, whatever the case', () => {
    expect(waveformRole('N54 cam crank.PSDATA', '')).toBe('psdata')
    expect(waveformRole('cam crank.pssettings', '')).toBe('pssettings')
    expect(waveformRole('export.csv', 'text/csv')).toBe('csv')
    expect(waveformRole('IMG_2041.HEIC', '')).toBe('image')
    expect(waveformRole('screen', 'image/png')).toBe('image')
    expect(waveformRole('notes.docx', '')).toBeNull()
  })
})
