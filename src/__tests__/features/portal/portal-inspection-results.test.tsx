/**
 * An inspection's results as the customer reads them in the portal: what was
 * measured is printed with its unit the way it is written ("3.2 mm", but
 * "45%"), and the block is drawn from the portal theme so it reads on the
 * dark theme as on the light ones.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', async () => (await import('./helpers/serverIntl')).serverIntl)

import {
  PortalInspectionResults,
  withUnit,
} from '@/features/portal/Components/Detail/PortalInspectionResults'
import { serverTree } from './helpers/serverTree'

const item = (over: Record<string, unknown>) => ({
  id: 'i',
  name: 'Check',
  section: 'Brakes',
  sectionCode: '1',
  code: null,
  sortOrder: 0,
  condition: 'pass',
  notes: null,
  inputType: null,
  unit: null,
  minValue: null,
  maxValue: null,
  measuredValue: null,
  textValue: null,
  ...over,
})

const results = async (items: ReturnType<typeof item>[]) =>
  render(
    await serverTree(<PortalInspectionResults items={items} severityScale="basic" country={null} />)
  )

describe('a measured value', () => {
  it('takes a space before a unit that is a word and none before a sign', () => {
    expect(withUnit('3.2', 'mm')).toBe('3.2 mm')
    expect(withUnit('0.5', 'm⁻¹')).toBe('0.5 m⁻¹')
    expect(withUnit('45', '%')).toBe('45%')
    expect(withUnit('12', '°')).toBe('12°')
    expect(withUnit('7', null)).toBe('7')
    expect(withUnit('7', '  ')).toBe('7')
  })

  it('is printed with its unit beside the check it belongs to', async () => {
    await results([
      item({
        id: 'pads',
        name: 'Brake pads',
        inputType: 'measurement',
        unit: 'mm',
        measuredValue: 3.2,
        minValue: 3,
      }),
      item({
        id: 'force',
        name: 'Brake force',
        sortOrder: 1,
        inputType: 'measurement',
        unit: '%',
        measuredValue: 45,
      }),
    ])
    const rows = screen.getAllByRole('listitem')
    const pads = rows.find((row) => row.textContent?.includes('Brake pads')) as HTMLElement
    expect(within(pads).getByText('3.2 mm')).toBeInTheDocument()
    const force = rows.find((row) => row.textContent?.includes('Brake force')) as HTMLElement
    expect(within(force).getByText('45%')).toBeInTheDocument()
    expect(within(force).queryByText('45 %')).not.toBeInTheDocument()
  })
})

describe('the results', () => {
  it('group the checks by section and leave out what was not inspected', async () => {
    await results([
      item({ id: 'a', name: 'Brake hoses', condition: 'fail', notes: 'Cracked at the front left' }),
      item({ id: 'b', name: 'Horn', section: 'Electrics', sectionCode: '4', sortOrder: 2 }),
      item({ id: 'c', name: 'Tow bar', condition: 'not_inspected', sortOrder: 3 }),
    ])
    expect(screen.getByRole('heading', { name: /Brakes/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Electrics/ })).toBeInTheDocument()
    expect(screen.getAllByText('Cracked at the front left').length).toBeGreaterThan(0)
    expect(screen.queryByText('Tow bar')).not.toBeInTheDocument()
  })

  it('take their surfaces and quiet text from the portal theme, not the app', async () => {
    const { container } = await results([
      item({ id: 'a', name: 'Brake hoses', condition: 'fail', notes: 'Cracked' }),
      item({ id: 'b', name: 'Horn', sortOrder: 1, code: '4.1' }),
    ])
    expect(container.innerHTML).not.toMatch(
      /\b(?:text|bg|border)-(?:muted-foreground|foreground|primary|destructive|card|muted|background|border)\b/
    )
  })

  it('say so when nothing has been graded yet', async () => {
    await results([item({ condition: 'not_inspected' })])
    expect(screen.getByText('No results yet.')).toBeInTheDocument()
  })
})
