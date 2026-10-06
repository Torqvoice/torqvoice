/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as NEW from '@/features/settings/Schema/invoiceLayoutSchema'
import * as OLD from './head/invoiceLayoutSchema'
import * as OLDP from './head/layoutPresets'
import { themeOf } from '@/features/invoice-designer/Components/designTheme'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import { invoiceLabels } from '@/features/invoice-designer/Lib/invoiceLabels'
import { workOrderLabels } from '@/features/invoice-designer/Lib/workOrderLabels'
import { certificateLabels } from '@/features/inspections/Lib/certificateLabels'
import { buildDocumentSpec } from '@/features/invoice-designer/Spec/buildSpec'
import pdfEn from '../../../messages/en/pdf.json'

type L = NEW.InvoiceLayoutConfig
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const OUT = process.env.OUT_FILE as string
const docTypes = ['invoice', 'quote', 'certificate', 'work_order'] as const
type DT = (typeof docTypes)[number]

const stableSorted = (l: L) =>
  [...l.sections].map((s, i) => ({ s, i })).sort((a, b) => a.s.order - b.s.order || a.i - b.i).map((x) => x.s)
const sheetOrder = (l: L): L => ({ ...l, sections: stableSorted(l).map((s, i) => ({ ...s, order: i })) })
const without = (l: L, ids: string[]): L => ({ ...l, sections: l.sections.filter((s) => !ids.includes(s.id)) })

function sources(dt: DT) {
  const out: { name: string; layout: L }[] = []
  out.push({ name: `${dt}:default`, layout: OLD.getDefaultLayout(dt === 'quote' ? 'invoice' : (dt as any)) as L })
  const presets = dt === 'certificate' ? OLDP.certificatePresets : dt === 'work_order' ? OLDP.workOrderPresets : OLDP.layoutPresets
  for (const p of presets) out.push({ name: `${dt}:${p.id}`, layout: OLDP.buildLayoutFromPreset(p as any) as L })
  return out
}

function sample(dt: DT, clean: boolean) {
  const labels = dt === 'certificate' ? certificateLabels(pdfEn as any) : dt === 'work_order' ? workOrderLabels(pdfEn as any) : invoiceLabels(pdfEn as any, dt)
  const s: any = buildSampleData(
    { name: 'Shop', address: 'A road', phone: '555', email: 's@example.com', logoUrl: '' } as any,
    [],
    ((key: string) => key) as any,
    labels,
    dt
  )
  if (clean && s.certificate) {
    s.certificate = {
      ...s.certificate,
      defects: [],
      sections: s.certificate.sections.map((g: any) => ({ ...g, rows: g.rows.filter((r: any) => r.kind !== 'defect') })),
    }
  }
  return s
}

function normalized(layout: L, data: any) {
  const spec: any = buildDocumentSpec(layout, themeOf({ primaryColor: '#d97706', headerStyle: 'standard', fontFamily: 'Helvetica' } as any, layout) as any, data)
  let rank = 0
  return JSON.stringify(
    spec.blocks.map((b: any) => ({
      ...b,
      placement: b.placement?.mode === 'flow' ? { ...b.placement, order: rank++ } : b.placement,
    }))
  )
}

describe('spec equality', () => {
  it('compares printed specs', () => {
    const problems: string[] = []
    let n = 0
    const eras: Record<DT, string[][]> = {
      invoice: [[], ['condition_map'], ['condition_map', 'signature']],
      quote: [[], ['condition_map'], ['condition_map', 'signature']],
      certificate: [[], ['condition_map'], ['condition_map', 'signature']],
      work_order: [[], ['condition_map']],
    }
    for (const dt of docTypes) {
      for (const clean of [false, true]) {
        const data = sample(dt, clean)
        for (const src of sources(dt)) {
          for (const gone of eras[dt]) {
            for (const version of [undefined, 3]) {
              const base = without(src.layout, gone)
              const raw: L = clone({ ...base, ...(version !== undefined ? { version } : {}) })
              const sheet: L = clone({ ...sheetOrder(base), ...(version !== undefined ? { version } : {}) })
              const ref = normalized(OLD.mergeWithDefaults(clone(sheet) as any) as L, data)
              for (const [form, stored] of [['raw', raw], ['sheet', sheet]] as const) {
                n++
                const got = normalized(NEW.mergeWithDefaults(clone(stored)), data)
                if (got !== ref) problems.push(`[spec differs] ${src.name} clean=${clean} without=${gone.join('+')} v=${version} form=${form}`)
              }
            }
          }
        }
      }
    }
    writeFileSync(`${OUT}.spec.txt`, `${n} comparisons\n` + (problems.length ? problems.join('\n') : 'NO PROBLEMS'))
    expect(true).toBe(true)
  })
})
