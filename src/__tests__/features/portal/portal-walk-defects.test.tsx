/**
 * What a walk through every portal screen found, pinned down.
 *
 * A browser decides where text wraps and jsdom does not, so the layout cases
 * check the structure each fix rests on (which element may give way and which
 * may not) and say why. The wording cases check what a customer reads.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { format, fullHome } from './helpers/fixtures'

vi.mock('next/navigation', () => ({
  usePathname: () => '/portal/fjordside/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('next-intl/server', async () => (await import('./helpers/serverIntl')).serverIntl)
vi.mock('@/features/portal/Actions/respondToPortalQuote', () => ({
  respondToPortalQuote: vi.fn(async () => ({ success: true, data: { status: 'accepted' } })),
}))

import { PortalFacts } from '@/features/portal/Components/Detail/PortalPageParts'
import { Home as Colour } from '@/features/portal/Components/Themes/Colour/Home'
import { Home as Daylight } from '@/features/portal/Components/Themes/Daylight/Home'
import { Home as Garage } from '@/features/portal/Components/Themes/Garage/Home'
import { Home as Print } from '@/features/portal/Components/Themes/Print/Home'
import type { PortalHomeProps } from '@/features/portal/Components/Themes/types'
import type { PortalHomeData } from '@/features/portal/Lib/homeTypes'

const HOMES = { Daylight, Garage, Print, Colour }
type Theme = keyof typeof HOMES

const home = async (
  theme: Theme,
  data: PortalHomeData,
  chat: PortalHomeProps['chat'] = <p>The chat</p>
) => render(await HOMES[theme]({ orgParam: 'fjordside', data, format, chat }))

const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/)

describe('a heading beside something wide', () => {
  it('Colour: the panel name keeps its width and the car beside it is what gives way', async () => {
    await home('Colour', fullHome)
    const heading = screen.getByRole('heading', { name: 'Tyre hotel' })
    // The name and its icon neither shrink nor start from nothing: a basis
    // of zero is what let the car's name squeeze "Tyre hotel" to a letter a line.
    const label = heading.closest('[data-panel-head-label]')
    expect(classes(label)).toContain('flex-[1_0_auto]')
    expect(classes(heading)).not.toContain('flex-1')
    // The car's name may shrink, and is cut short when it must.
    const aside = label?.parentElement?.querySelector('[data-panel-head-aside]') ?? null
    expect(classes(aside)).toContain('min-w-0')
    expect(classes(within(aside as HTMLElement).getByText('Toyota RAV4'))).toContain('truncate')
  })

  it('a label in a label and value row never gives way to its value', () => {
    render(<PortalFacts facts={[{ label: 'Vehicle', value: '2022 Porsche 911 Carrera S' }]} />)
    expect(classes(screen.getByText('Vehicle'))).toContain('shrink-0')
    expect(classes(screen.getByText('2022 Porsche 911 Carrera S'))).toContain('min-w-0')
  })

  it('no box in the portal is sized as if a word could break at any letter', () => {
    const css = readFileSync(join(process.cwd(), 'src/features/portal/portal-themes.css'), 'utf8')
    const root = css.slice(css.indexOf('.portal-root {'), css.indexOf('.portal-scope {'))
    expect(root).toContain('overflow-wrap: break-word')
    expect(root).not.toMatch(/overflow-wrap:\s*anywhere/)
  })
})

describe('Garage: the board beside the chat', () => {
  it('stops at the chat from 1100 px: its right bleed exists only below that', async () => {
    const { container } = await home('Garage', fullHome)
    const board = classes(container.querySelector('[data-board]'))
    // Each width range has its own right margin and none is an override of
    // another: a px breakpoint is emitted before the rem ones, so "mr-0 from
    // 1100 px" lost to "lg:-mx-10" and the board ran 40 px under the chat.
    expect(board).toEqual(
      expect.arrayContaining(['max-sm:-mr-4', 'sm:max-lg:-mr-6', 'lg:max-[1100px]:-mr-10'])
    )
    expect(board.some((name) => /(^|:)-mx-/.test(name))).toBe(false)
    expect(board).not.toContain('min-[1100px]:mr-0')
    expect(board).not.toContain('lg:-mr-10')
  })

  it('runs out to both edges when there is no chat', async () => {
    const { container } = await home('Garage', fullHome, null)
    expect(classes(container.querySelector('[data-board]'))).toEqual(
      expect.arrayContaining(['-ml-4', 'lg:-ml-10', '-mr-4', 'lg:-mr-10'])
    )
  })
})

describe('a request sent with a quick choice', () => {
  const data: PortalHomeData = {
    ...fullHome,
    requests: [
      {
        id: 'r1',
        description: 'Something is wrong\n\nA knocking noise from the front left over bumps.',
        vehicle: null,
        createdAt: '2026-11-13T09:00:00Z',
        preferredDate: null,
      },
      {
        id: 'r2',
        description: 'Could you check the wiper blades at the next visit?',
        vehicle: null,
        createdAt: '2026-11-12T09:00:00Z',
        preferredDate: null,
      },
    ],
  }

  it.each(
    Object.keys(HOMES) as Theme[]
  )('%s: shows the choice on a line of its own and the words after it', async (theme) => {
    await home(theme, data)
    const sent = within(screen.getByRole('region', { name: 'Sent to the workshop' }))
    const topic = sent.getByText('Something is wrong')
    const words = sent.getByText('A knocking noise from the front left over bumps.')
    expect(topic).not.toBe(words)
    expect(topic).toHaveAttribute('data-request-topic')
    expect(topic).not.toHaveTextContent('knocking')
    // A request without a choice is its words alone.
    expect(
      sent.getByText('Could you check the wiper blades at the next visit?')
    ).toBeInTheDocument()
    expect(document.querySelectorAll('[data-request-topic]')).toHaveLength(1)
  })
})
