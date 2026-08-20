/**
 * Tests for the feature hint manager.
 *
 * Two rules carry the whole design, and both are the kind that quietly stop
 * holding once somebody adds a third hint: only one shows at a time, and a
 * dismissed hint stays dismissed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const dismissFeatureHint = vi.fn().mockResolvedValue({ success: true, data: { seen: [] } })
vi.mock('@/features/settings/Actions/featureHintActions', () => ({
  dismissFeatureHint: (id: string) => dismissFeatureHint(id),
}))

const { FeatureHintProvider, useFeatureHint } = await import(
  '@/components/feature-hint/feature-hint-provider'
)

/** Reports whether its hint is showing, and offers a way to dismiss it. */
function Probe({ id, eligible = true }: { id: string; eligible?: boolean }) {
  const { open, dismiss } = useFeatureHint(id, eligible)
  return (
    <div>
      <span data-testid={`state-${id}`}>{open ? 'open' : 'closed'}</span>
      <button type="button" data-testid={`dismiss-${id}`} onClick={dismiss}>
        dismiss
      </button>
    </div>
  )
}

function state(id: string) {
  return screen.getByTestId(`state-${id}`).textContent
}

function dismiss(id: string) {
  act(() => {
    screen.getByTestId(`dismiss-${id}`).click()
  })
}

beforeEach(() => {
  dismissFeatureHint.mockClear()
})

describe('which hint shows', () => {
  it('shows the first one registered', () => {
    render(
      <FeatureHintProvider initialSeen={[]} pending={['first', 'second']}>
        <Probe id="first" />
        <Probe id="second" />
      </FeatureHintProvider>
    )
    expect(state('first')).toBe('open')
  })

  it('holds the second back until the first is dismissed', () => {
    // A screen with two of these is noise nobody reads.
    render(
      <FeatureHintProvider initialSeen={[]} pending={['first', 'second']}>
        <Probe id="first" />
        <Probe id="second" />
      </FeatureHintProvider>
    )
    expect(state('second')).toBe('closed')

    dismiss('first')
    expect(state('first')).toBe('closed')
    expect(state('second')).toBe('open')
  })

  it('skips a hint that is not eligible rather than stalling behind it', () => {
    // An unswitched module must not sit at the head of the queue forever.
    render(
      <FeatureHintProvider initialSeen={[]} pending={['first', 'second']}>
        <Probe id="first" eligible={false} />
        <Probe id="second" />
      </FeatureHintProvider>
    )
    expect(state('first')).toBe('closed')
    expect(state('second')).toBe('open')
  })
})

describe('staying dismissed', () => {
  it('records the dismissal against the workshop', () => {
    render(
      <FeatureHintProvider initialSeen={[]} pending={['first']}>
        <Probe id="first" />
      </FeatureHintProvider>
    )
    dismiss('first')
    expect(dismissFeatureHint).toHaveBeenCalledWith('first')
  })

  it('closes straight away rather than waiting on the write', () => {
    // Nobody should watch a spinner to put a note away.
    render(
      <FeatureHintProvider initialSeen={[]} pending={['first']}>
        <Probe id="first" />
      </FeatureHintProvider>
    )
    dismiss('first')
    expect(state('first')).toBe('closed')
  })

  it('never shows one the workshop has already been shown', () => {
    render(
      <FeatureHintProvider initialSeen={['first']} pending={['first', 'second']}>
        <Probe id="first" />
        <Probe id="second" />
      </FeatureHintProvider>
    )
    expect(state('first')).toBe('closed')
    expect(state('second')).toBe('open')
  })

  it('treats a new version as a different hint', () => {
    // Which is how reworded copy reaches a workshop that dismissed the old one.
    render(
      <FeatureHintProvider initialSeen={['thing.v1']} pending={['thing.v2']}>
        <Probe id="thing.v2" />
      </FeatureHintProvider>
    )
    expect(state('thing.v2')).toBe('open')
  })
})

describe('only announcing what was just switched on', () => {
  it('says nothing about a link that was already there', () => {
    // The failure this exists to stop: adding a hint for a feature a workshop
    // has been using for a year, and announcing it to them as new. Eligible
    // is true on every page load; raised is true only at the moment of the
    // flip.
    render(
      <FeatureHintProvider initialSeen={[]} pending={[]}>
        <Probe id="telegram.v1" />
      </FeatureHintProvider>
    )
    expect(state('telegram.v1')).toBe('closed')
  })

  it('lets a raised hint through while an unraised one waits its turn', () => {
    render(
      <FeatureHintProvider initialSeen={[]} pending={['second']}>
        <Probe id="first" />
        <Probe id="second" />
      </FeatureHintProvider>
    )
    expect(state('first')).toBe('closed')
    expect(state('second')).toBe('open')
  })
})

describe('outside a provider', () => {
  it('shows nothing rather than throwing', () => {
    // A hint rendered somewhere the provider does not reach should be
    // invisible, not a crash on that whole screen.
    render(<Probe id="orphan" />)
    expect(state('orphan')).toBe('closed')
  })
})
