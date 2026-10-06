/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import * as NEW from '@/features/settings/Schema/invoiceLayoutSchema'
import * as NEWP from '@/features/settings/Schema/layoutPresets'
import * as OLD from './head/invoiceLayoutSchema'
import * as OLDP from './head/layoutPresets'

type L = NEW.InvoiceLayoutConfig
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const OUT = process.env.OUT_FILE as string

/** Effective visible fields the way buildSpec.sectionFields reads them. */
function effFields(mod: typeof NEW | typeof OLD, s: any, head: boolean): string[] | null {
  if (!s.fields) return null
  const out = [
    ...s.fields.filter((f: any) => f.visible).map((f: any) => f.id),
    ...(mod as any).unmentionedGrandfathered(s.id, s.fields),
  ]
  // At HEAD the "no deficiencies" note always printed.
  if (head && s.id === 'defects' && !out.includes('no_defects_note')) out.push('no_defects_note')
  return out
}

const stableSorted = (l: L) =>
  [...l.sections]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.order - b.s.order || a.i - b.i)
    .map((x) => x.s)

function view(mod: typeof NEW | typeof OLD, layout: L, head: boolean) {
  return stableSorted(layout)
    .filter((s) => s.visible)
    .map((s) => ({
      id: s.id,
      column: s.column ?? null,
      boxed: s.boxed ?? null,
      heading: s.heading ?? null,
      variant: s.variant ?? null,
      text: s.text ?? null,
      style: s.style ?? null,
      fields: effFields(mod, s, head),
      bold: (s.fields ?? [])
        .filter((f: any) => f.bold !== undefined)
        .map((f: any) => [f.id, f.bold]),
    }))
}

function fullOrder(layout: L, drop: string[] = []) {
  return stableSorted(layout)
    .map((s) => s.id)
    .filter((id) => !drop.includes(id))
}

const docTypes = ['invoice', 'quote', 'certificate', 'work_order'] as const
type DT = (typeof docTypes)[number]

function sources(dt: DT): { name: string; layout: L }[] {
  const out: { name: string; layout: L }[] = []
  const base = OLD.getDefaultLayout(dt === 'quote' ? 'invoice' : (dt as any)) as L
  out.push({ name: `${dt}:default`, layout: base })
  const presets =
    dt === 'certificate'
      ? OLDP.certificatePresets
      : dt === 'work_order'
        ? OLDP.workOrderPresets
        : OLDP.layoutPresets
  for (const p of presets)
    out.push({ name: `${dt}:${p.id}`, layout: OLDP.buildLayoutFromPreset(p as any) as L })
  return out
}

const sheetOrder = (l: L): L => ({
  ...l,
  sections: stableSorted(l).map((s, i) => ({ ...s, order: i })),
})

const without = (l: L, ids: string[]): L => ({
  ...l,
  sections: l.sections.filter((s) => !ids.includes(s.id)),
})

const NEWIDS = ['defects', 'results_table']

function check(tag: string, dt: DT, stored: L, reference: L, problems: string[]) {
  const note = (m: string) => problems.push(m)
  const oldOut = OLD.mergeWithDefaults(clone(reference) as any) as L
  const newOut = NEW.mergeWithDefaults(clone(stored))
  const a = JSON.stringify(view(OLD, oldOut, true))
  const b = JSON.stringify(view(NEW, newOut, false))
  if (a !== b) note(`[visible differs] ${tag}\n  old=${a}\n  new=${b}`)
  const dropNew = NEWIDS.filter((id) => !oldOut.sections.some((s) => s.id === id))
  const fo = JSON.stringify(fullOrder(oldOut))
  const fn = JSON.stringify(fullOrder(newOut, dropNew))
  if (fo !== fn) note(`[full order differs] ${tag}\n  old=${fo}\n  new=${fn}`)
  const twice = NEW.mergeWithDefaults(clone(newOut))
  if (!isDeepStrictEqual(clone(twice), clone(newOut))) note(`[not idempotent] ${tag}`)
  const stamped = { ...newOut, version: 3 }
  const parsed = NEW.invoiceLayoutConfigSchema.safeParse(stamped)
  if (!parsed.success) note(`[schema reject] ${tag} ${parsed.error.message}`)
  else if (!isDeepStrictEqual(clone(parsed.data), clone(stamped))) note(`[schema strips] ${tag}`)
  // array order equals order numbers?
  for (const id of NEWIDS) {
    const s = newOut.sections.find((x) => x.id === id)
    if (!s) note(`[missing ${id}] ${tag}`)
    else if (dt !== 'certificate' && s.visible) note(`[${id} visible] ${tag}`)
  }
  const full = fullOrder(newOut)
  if (dt === 'invoice' || dt === 'quote') {
    const cm = full.indexOf('condition_map')
    if (full[cm - 2] !== 'defects' || full[cm - 1] !== 'results_table')
      note(`[not in front of condition_map] ${tag} ${JSON.stringify(full)}`)
  }
  return { oldOut, newOut, full }
}

describe('saved designs', () => {
  it('HEAD-era designs print the same', () => {
    const problems: string[] = []
    const positions: string[] = []
    for (const dt of docTypes) {
      for (const src of sources(dt)) {
        for (const version of [undefined, 2, 3]) {
          for (const form of ['raw', 'sheet'] as const) {
            const stored: L = clone({
              ...(form === 'raw' ? src.layout : sheetOrder(src.layout)),
              ...(version !== undefined ? { version } : {}),
            })
            const tag = `${src.name} v=${version} form=${form}`
            const { full } = check(tag, dt, stored, stored, problems)
            if (version === 3 && form === 'raw') positions.push(`${src.name}: ${full.join(' > ')}`)
          }
        }
      }
    }
    writeFileSync(
      `${OUT}.head-era.txt`,
      (problems.length ? problems.join('\n\n') : 'NO PROBLEMS') + '\n\n' + positions.join('\n')
    )
    expect(true).toBe(true)
  })

  it('earlier-era designs: new merge of raw == HEAD merge of sheet-order', () => {
    const problems: string[] = []
    const eras: Record<DT, string[][]> = {
      invoice: [['condition_map'], ['condition_map', 'signature'], ['condition_map', 'signature', 'warranty']],
      quote: [['condition_map'], ['condition_map', 'signature'], ['condition_map', 'signature', 'warranty']],
      certificate: [['condition_map'], ['signature'], ['condition_map', 'signature']],
      work_order: [['condition_map']],
    }
    for (const dt of docTypes) {
      for (const src of sources(dt)) {
        for (const gone of eras[dt]) {
          for (const version of [undefined, 2, 3]) {
            const raw: L = clone({
              ...without(src.layout, gone),
              ...(version !== undefined ? { version } : {}),
            })
            const sheet: L = clone({
              ...sheetOrder(without(src.layout, gone)),
              ...(version !== undefined ? { version } : {}),
            })
            check(`${src.name} era-without=${gone.join('+')} v=${version} raw-vs-sheet`, dt, raw, sheet, problems)
            check(`${src.name} era-without=${gone.join('+')} v=${version} sheet-vs-sheet`, dt, sheet, sheet, problems)
          }
        }
      }
    }
    writeFileSync(`${OUT}.earlier-era.txt`, problems.length ? problems.join('\n\n') : 'NO PROBLEMS')
    expect(true).toBe(true)
  })

  it('new presets vs saved presets: field switches', () => {
    const lines: string[] = []
    for (const dt of docTypes) {
      const presets =
        dt === 'certificate'
          ? NEWP.certificatePresets
          : dt === 'work_order'
            ? NEWP.workOrderPresets
            : NEWP.layoutPresets
      for (const p of presets) {
        const fresh = NEWP.buildLayoutFromPreset(p)
        const oldP = (
          dt === 'certificate'
            ? OLDP.certificatePresets
            : dt === 'work_order'
              ? OLDP.workOrderPresets
              : OLDP.layoutPresets
        ).find((x) => x.id === p.id)!
        const savedAtHead = NEW.mergeWithDefaults({
          ...(OLDP.buildLayoutFromPreset(oldP as any) as L),
          version: 3,
        })
        for (const id of NEWIDS) {
          const f = fresh.sections.find((s) => s.id === id)
          const s = savedAtHead.sections.find((x) => x.id === id)
          lines.push(
            `${dt}:${p.id} ${id} fresh(visible=${f?.visible}, fields=${JSON.stringify(effFields(NEW, f, false))}) savedAtHead(visible=${s?.visible}, fields=${JSON.stringify(effFields(NEW, s, false))})`
          )
        }
        // Fresh preset now vs fresh preset at HEAD: visible view
        const a = JSON.stringify(view(OLD, OLDP.buildLayoutFromPreset(oldP as any) as L, true))
        const b = JSON.stringify(view(NEW, fresh, false))
        if (a !== b) lines.push(`  !! fresh preset view differs from HEAD's\n   old=${a}\n   new=${b}`)
      }
    }
    writeFileSync(`${OUT}.presets.txt`, lines.join('\n'))
    expect(true).toBe(true)
  })
})
