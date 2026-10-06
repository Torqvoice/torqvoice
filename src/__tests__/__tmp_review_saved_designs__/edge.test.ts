/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: { documentDesignSnapshot: { findFirst: vi.fn(async () => null) } },
}))

import * as NEW from '@/features/settings/Schema/invoiceLayoutSchema'
import * as NEWP from '@/features/settings/Schema/layoutPresets'
import * as OLD from './head/invoiceLayoutSchema'
import * as OLDP from './head/layoutPresets'
import { buildCertificatePrintSpec } from '@/features/inspections/Pdf/buildCertificatePrint'
import { liveCertificateDesign } from '@/features/inspections/Pdf/certificateDesign'
import {
  materializeDesignSource,
  templateConfigFromSource,
  designSourceFromSnapshot,
  designSourceFromStored,
} from '@/features/invoice-designer/Lib/designSource'

type L = NEW.InvoiceLayoutConfig
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const OUT = process.env.OUT_FILE as string
const lines: string[] = []
const say = (s: string) => lines.push(s)

const item = (over: Record<string, unknown>) => ({
  id: 'x',
  name: 'Check',
  section: 'Braking',
  sectionCode: '1',
  code: null,
  condition: 'pass',
  notes: null,
  sortOrder: 0,
  ...over,
})
const data = () => ({
  id: 'cmuinspection000000000001',
  status: 'in_progress',
  mileage: 84120,
  notes: null,
  createdAt: new Date('2026-09-24T09:00:00Z'),
  completedAt: null,
  severityScale: 'eu',
  country: 'NO',
  vehicleCategory: 'M1',
  nextTestDue: null,
  certificateNumber: 'CERT-7',
  inspectorName: 'Kari',
  testLocation: 'Bay 2',
  template: { name: 'Annual test', severityScale: 'eu', country: 'NO' },
  vehicle: { make: 'Volvo', model: 'V60', year: 2020, vin: 'YV1', licensePlate: 'AB', mileage: 1, customer: { name: 'Ola' } },
  items: [
    item({ id: 'a', name: 'Wipers', condition: 'pass', sortOrder: 1 }),
    item({ id: 'b', name: 'Brake hose', condition: 'pass', sortOrder: 2 }),
  ],
})
function texts(node: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.kind === 'text' && n.text) out.push(String(n.text))
    for (const child of n.children ?? []) walk(child.node ?? child)
  }
  walk(node)
  return out
}
const stableIds = (l: L, onlyVisible = false) =>
  [...l.sections]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.order - b.s.order || a.i - b.i)
    .filter((x) => !onlyVisible || x.s.visible)
    .map((x) => x.s.id)

describe('edge', () => {
  it('default certificate, clean car', () => {
    // Today: a workshop that never designed a certificate.
    const live = liveCertificateDesign({})
    const tpl = templateConfigFromSource(live)
    const spec = buildCertificatePrintSpec({ data: data() as any, layoutConfig: tpl.layoutConfig }) as any
    const block = spec.blocks.find((b: any) => b.id === 'defects')
    say(`LIVE default certificate, clean car: defects block = ${block ? JSON.stringify(texts(block.content)) : 'ABSENT'}`)
    say(`  live layout defects fields = ${JSON.stringify(tpl.layoutConfig!.sections.find((s) => s.id === 'defects')?.fields)}`)

    // As frozen at HEAD by completing an inspection on the default design.
    const headPreset = OLDP.certificatePresets.find((p) => p.id === 'certificate-regulator')!
    const headFrozen = OLD.mergeWithDefaults({ ...(OLDP.buildLayoutFromPreset(headPreset as any) as any), version: 3 })
    say(`  HEAD-frozen layout defects fields = ${JSON.stringify(headFrozen.sections.find((s: any) => s.id === 'defects')?.fields)}`)
    const src = designSourceFromSnapshot(headFrozen, {})!
    const tpl2 = templateConfigFromSource(src)
    const spec2 = buildCertificatePrintSpec({ data: data() as any, layoutConfig: tpl2.layoutConfig }) as any
    const block2 = spec2.blocks.find((b: any) => b.id === 'defects')
    say(`HEAD-frozen default certificate, clean car: defects block = ${block2 ? JSON.stringify(texts(block2.content)) : 'ABSENT'}`)

    // Now freeze (complete) today
    const frozenNow = materializeDesignSource(live)
    say(`  frozen today defects fields = ${JSON.stringify((frozenNow.layout.sections as any[]).find((s) => s.id === 'defects')?.fields)}`)

    // Fresh regulator preset in the designer vs other presets
    for (const p of NEWP.certificatePresets) {
      const l = NEWP.buildLayoutFromPreset(p)
      say(`  preset ${p.id}: defects.visible=${l.sections.find((s) => s.id === 'defects')?.visible} fields=${JSON.stringify(l.sections.find((s) => s.id === 'defects')?.fields)}`)
    }
  })

  it('ties, missing order, fractions', () => {
    const base = OLD.getDefaultLayout('invoice') as L
    // ties: everything order 0
    const tied: L = { ...clone(base), version: 3, sections: clone(base).sections.map((s) => ({ ...s, order: 0 })) }
    const o = OLD.mergeWithDefaults(clone(tied) as any) as L
    const n = NEW.mergeWithDefaults(clone(tied))
    say(`ties: old visible=${stableIds(o, true).join(',')}`)
    say(`ties: new visible=${stableIds(n, true).join(',')}`)
    say(`ties: new full=${stableIds(n).join(',')}`)

    // pairs tied
    const pre = OLDP.buildLayoutFromPreset(OLDP.layoutPresets.find((p) => p.id === 'detailed') as any) as L
    const pairs: L = { ...clone(pre), version: 3, sections: clone(pre).sections.map((s) => ({ ...s, order: Math.floor(s.order / 2) })) }
    const o2 = OLD.mergeWithDefaults(clone(pairs) as any) as L
    const n2 = NEW.mergeWithDefaults(clone(pairs))
    say(`pair ties equal visible: ${isDeepStrictEqual(stableIds(o2, true), stableIds(n2, true))}`)
    if (!isDeepStrictEqual(stableIds(o2, true), stableIds(n2, true))) {
      say(` old=${stableIds(o2, true)}`)
      say(` new=${stableIds(n2, true)}`)
    }

    // missing order entirely (as raw JSON from a settings row)
    const noOrder: any = { version: 3, sections: clone(pre).sections.map(({ order: _o, ...s }: any) => s) }
    let oldVis: string[] = []
    let newVis: string[] = []
    try {
      const o3 = OLD.mergeWithDefaults(clone(noOrder)) as L
      oldVis = [...o3.sections].sort((a, b) => a.order - b.order).filter((s) => s.visible).map((s) => s.id)
    } catch (e) {
      say(`missing order OLD threw ${(e as Error).message}`)
    }
    try {
      const n3 = NEW.mergeWithDefaults(clone(noOrder))
      newVis = [...n3.sections].sort((a, b) => a.order - b.order).filter((s) => s.visible).map((s) => s.id)
      say(`missing order: new orders = ${JSON.stringify(n3.sections.map((s) => s.order))}`)
    } catch (e) {
      say(`missing order NEW threw ${(e as Error).message}`)
    }
    say(`missing order: old visible=${oldVis.join(',')}`)
    say(`missing order: new visible=${newVis.join(',')}`)

    // some missing order
    const someMissing: any = { version: 3, sections: clone(pre).sections.map((s: any, i: number) => (i % 3 === 0 ? (({ order: _o, ...r }) => r)(s) : s)) }
    const o4 = OLD.mergeWithDefaults(clone(someMissing)) as L
    const n4 = NEW.mergeWithDefaults(clone(someMissing))
    const vis = (l: L) => [...l.sections].sort((a, b) => a.order - b.order).filter((s) => s.visible).map((s) => s.id)
    say(`some missing order: old visible=${vis(o4).join(',')}`)
    say(`some missing order: new visible=${vis(n4).join(',')}`)

    // fractions
    const frac: L = { ...clone(pre), version: 3, sections: clone(pre).sections.map((s) => ({ ...s, order: s.order + (s.id === 'document_title' ? -1.5 : 0) })) }
    const o5 = OLD.mergeWithDefaults(clone(frac) as any) as L
    const n5 = NEW.mergeWithDefaults(clone(frac))
    say(`fractions equal visible: ${isDeepStrictEqual(stableIds(o5, true), stableIds(n5, true))}; schema ok new=${NEW.invoiceLayoutConfigSchema.safeParse(n5).success} old=${OLD.invoiceLayoutConfigSchema.safeParse(o5).success}`)
  })

  it('legacy info layout', () => {
    const legacy: any = {
      sections: [
        { id: 'header', visible: true, order: 0 },
        { id: 'info', visible: true, order: 1, fields: [{ id: 'customer_name', visible: true }, { id: 'vin', visible: false }, { id: 'tech_name', visible: true }, { id: 'cf_abc', visible: true }] },
        { id: 'parts_table', visible: true, order: 2 },
        { id: 'labor_table', visible: true, order: 3 },
        { id: 'totals', visible: true, order: 4 },
        { id: 'notes', visible: true, order: 5 },
        { id: 'bank_account', visible: true, order: 6 },
        { id: 'footer', visible: true, order: 7 },
        { id: 'custom_fields', visible: false, order: 8 },
      ],
    }
    const o = OLD.mergeWithDefaults(clone(legacy)) as L
    const n = NEW.mergeWithDefaults(clone(legacy))
    say(`legacy old visible=${stableIds(o, true).join(',')}`)
    say(`legacy new visible=${stableIds(n, true).join(',')}`)
    say(`legacy new full=${stableIds(n).join(',')}`)
    say(`legacy new cols=${JSON.stringify(n.sections.filter((s) => s.column).map((s) => [s.id, s.column]))} old cols=${JSON.stringify(o.sections.filter((s) => s.column).map((s) => [s.id, s.column]))}`)
    say(`legacy idempotent=${isDeepStrictEqual(clone(NEW.mergeWithDefaults(clone(n))), clone(n))} schema=${NEW.invoiceLayoutConfigSchema.safeParse(n).success}`)

    // reversed-array legacy (array order != order)
    const rev: any = { sections: [...legacy.sections].reverse() }
    const o2 = OLD.mergeWithDefaults(clone(rev)) as L
    const n2 = NEW.mergeWithDefaults(clone(rev))
    say(`legacy reversed old visible=${stableIds(o2, true).join(',')}`)
    say(`legacy reversed new visible=${stableIds(n2, true).join(',')}`)
  })

  it('user-moved condition map / signature and columns', () => {
    const base = OLD.getDefaultLayout('invoice') as L
    // condition_map moved up to after vehicle, visible; signature first-of-closing moved above totals
    const ids = base.sections.map((s) => s.id)
    const move = (arr: string[], id: string, after: string) => {
      const a = arr.filter((x) => x !== id)
      a.splice(a.indexOf(after) + 1, 0, id)
      return a
    }
    let order = move(ids, 'condition_map', 'customer')
    order = move(order, 'signature', 'labor_table')
    // keep array in built-in order, numbers in designed order (designer could store either)
    const designed: L = {
      version: 3,
      sections: base.sections.map((s) => ({ ...s, order: order.indexOf(s.id), visible: s.id === 'condition_map' || s.id === 'signature' ? true : s.visible })),
    }
    const o = OLD.mergeWithDefaults(clone(designed) as any) as L
    const n = NEW.mergeWithDefaults(clone(designed))
    say(`moved: old visible=${stableIds(o, true).join(',')}`)
    say(`moved: new visible=${stableIds(n, true).join(',')}`)
    say(`moved: new full   =${stableIds(n).join(',')}`)
    const groupsOld = OLD.groupSectionsForRendering(o.sections as any)
    const groupsNew = NEW.groupSectionsForRendering(n.sections)
    say(`moved: groups equal=${isDeepStrictEqual(groupsOld, groupsNew)}`)

    // design saved before the map existed, with signature moved above bank details
    const preMap: L = { version: 3, sections: designed.sections.filter((s) => s.id !== 'condition_map') }
    const n2 = NEW.mergeWithDefaults(clone(preMap))
    const o2 = OLD.mergeWithDefaults(clone({ ...preMap, sections: [...preMap.sections].sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i })) }) as any) as L
    say(`preMap moved: new full=${stableIds(n2).join(',')}`)
    say(`preMap moved: old(sheet) full=${stableIds(o2).join(',')}`)
  })

  it('work order / certificate layouts with no documentType stamp', () => {
    const wo = OLD.getDefaultLayout('work_order') as L
    const unstamped: any = { version: 3, sections: clone(wo).sections, document: wo.document }
    // via design row -> savedDesignFromRow path merges as invoice first
    const asInvoice = NEW.mergeWithDefaults(clone(unstamped))
    const then = NEW.mergeWithDefaults({ ...clone(asInvoice), documentType: 'work_order' })
    say(`wo unstamped: as-invoice full=${stableIds(asInvoice).join(',')}`)
    say(`wo unstamped: then work_order full=${stableIds(then).join(',')}`)
    const direct = NEW.mergeWithDefaults({ ...clone(unstamped), documentType: 'work_order' })
    say(`wo stamped direct full=${stableIds(direct).join(',')}`)
    const oldDirect = OLD.mergeWithDefaults({ ...clone(unstamped), documentType: 'work_order' }) as L
    say(`wo direct visible equal old=${isDeepStrictEqual(stableIds(oldDirect, true), stableIds(direct, true))}`)
  })

  it('design row round trip through stored parse', () => {
    for (const dt of ['invoice', 'certificate', 'work_order'] as const) {
      const presets = dt === 'certificate' ? OLDP.certificatePresets : dt === 'work_order' ? OLDP.workOrderPresets : OLDP.layoutPresets
      for (const p of presets) {
        const stored = clone({ ...(OLDP.buildLayoutFromPreset(p as any) as L), version: 3 })
        const src = designSourceFromStored(stored, {})
        if (!src) { say(`stored parse failed ${p.id}`); continue }
        const merged = NEW.mergeWithDefaults(src.layout)
        const res = NEW.invoiceLayoutConfigSchema.safeParse({ ...merged, version: 3 })
        if (!res.success) say(`save schema rejects ${p.id}: ${res.error.message}`)
        // strict roundtrip: every field id kept
        const before = merged.sections.flatMap((s) => (s.fields ?? []).map((f) => `${s.id}.${f.id}=${f.visible}`))
        const after = res.success ? res.data.sections.flatMap((s) => (s.fields ?? []).map((f) => `${s.id}.${f.id}=${f.visible}`)) : []
        if (!isDeepStrictEqual(before, after)) say(`roundtrip loses fields ${p.id}`)
      }
    }
    say('round trip done')
  })

  it('writes', () => {
    writeFileSync(`${OUT}.edge.txt`, lines.join('\n'))
    expect(true).toBe(true)
  })
})
