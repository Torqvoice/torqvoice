/**
 * The presence layer, rendered, the way the app renders it.
 *
 * Two things only exist once React is involved, and both took this feature
 * down in a browser while every server test passed:
 *
 * - `useSyncExternalStore` compares snapshots by identity, so a store that
 *   hands back a new array each read renders until React gives up.
 * - Development mounts every effect twice. The first socket is closed by the
 *   cleanup and says so afterwards; it used to clear the shared reference on
 *   its way out, leaving the real socket open and unreachable for the rest of
 *   the page's life. So everything here runs under StrictMode, with a
 *   stand-in socket that reports its close late, as a real one does.
 *
 * The stand-in also refuses to be spoken to before it has said `ready`, which
 * is the server's behaviour: it reads the session first, and a frame sent
 * before that went nowhere.
 */
import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { RealtimeProvider } from '@/features/realtime/RealtimeProvider'
import { PresenceChips } from '@/features/realtime/Components/PresenceChips'
import { useRecordPresence } from '@/features/realtime/hooks'
import { TooltipProvider } from '@/components/ui/tooltip'
import messages from '../../../../messages/en/realtime.json'

class StandInSocket {
  static instances: StandInSocket[] = []
  static OPEN = 1
  static CLOSED = 3
  readyState = StandInSocket.OPEN
  sent: { t: string; [key: string]: unknown }[] = []
  tooEarly: unknown[] = []
  listening = false
  onopen: (() => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor(public url: string) {
    StandInSocket.instances.push(this)
  }
  send(data: string) {
    const message = JSON.parse(data)
    if (this.listening) this.sent.push(message)
    else this.tooEarly.push(message)
  }
  close() {
    this.readyState = StandInSocket.CLOSED
    // Reported afterwards, like the real thing.
    const report = this.onclose
    setTimeout(() => report?.({ code: 1000 }), 0)
  }
  deliver(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  ready() {
    this.listening = true
    this.deliver({ t: 'ready', you: { userId: 'me', name: 'Me', color: '#000' } })
  }
}

const ROOM = 'rec:serviceRecord:job-1'
const MARCO = { userId: 'u-2', name: 'Marco Rossi', color: '#db2777', devices: 1 }
const ME = { userId: 'me', name: 'Me', color: '#000', devices: 1 }
let renders = 0

function Probe() {
  renders++
  const { others } = useRecordPresence('serviceRecord', 'job-1')
  return <span data-testid="others">{others.map((user) => user.name).join(', ')}</span>
}

/** A work order page in miniature: something reading presence, and the chips. */
function Page() {
  return (
    <main>
      <Probe />
      <PresenceChips kind="serviceRecord" id="job-1" />
    </main>
  )
}

/**
 * The provider lives in the app shell and outlives any page, so the page is
 * mounted and unmounted underneath it, as in the app.
 */
function mount() {
  const tree = (open: boolean) => (
    <StrictMode>
      <NextIntlClientProvider locale="en" messages={{ realtime: messages }} timeZone="UTC">
        <TooltipProvider>
          <RealtimeProvider>{open ? <Page /> : null}</RealtimeProvider>
        </TooltipProvider>
      </NextIntlClientProvider>
    </StrictMode>
  )
  const view = render(tree(true))
  return { ...view, closePage: () => view.rerender(tree(false)) }
}

/** The socket the page ends up on, after React has mounted everything twice. */
const socket = () => StandInSocket.instances[StandInSocket.instances.length - 1]
const live = () => StandInSocket.instances.filter((s) => s.readyState === StandInSocket.OPEN)

beforeEach(() => {
  vi.useFakeTimers()
  renders = 0
  StandInSocket.instances = []
  vi.stubGlobal('WebSocket', StandInSocket)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Mounts, lets the first socket's late close land, and has the server answer. */
function open() {
  const view = mount()
  act(() => {
    vi.advanceTimersByTime(5)
  })
  act(() => socket().ready())
  return view
}

describe('the socket under React', () => {
  it('is one socket, still reachable after being mounted twice', () => {
    open()

    // One was ever opened: the first mount's start is cancelled by its cleanup.
    expect(StandInSocket.instances).toHaveLength(1)
    expect(live()).toHaveLength(1)
    expect(socket().sent).toEqual([
      { t: 'sub', rooms: [ROOM] },
      { t: 'enter', room: ROOM },
    ])
  })

  it('never speaks before the server is listening', () => {
    open()
    expect(StandInSocket.instances.flatMap((s) => s.tooEarly)).toEqual([])
  })

  it('stands in the room once, however many components ask', () => {
    // The probe and the chips both want the same room.
    open()
    expect(socket().sent.filter((message) => message.t === 'enter')).toHaveLength(1)
  })

  it('leaves the room when the page goes, and keeps the socket for the next page', () => {
    const view = open()
    socket().sent.length = 0

    act(() => view.closePage())

    expect(socket().sent).toEqual([
      { t: 'leave', room: ROOM },
      { t: 'unsub', rooms: [ROOM] },
    ])
    expect(live()).toHaveLength(1)
  })

  it('closes the socket when the whole app goes', () => {
    const view = open()
    act(() => view.unmount())
    expect(live()).toHaveLength(0)
  })
})

describe('who else is here', () => {
  it('settles instead of rendering forever', () => {
    open()
    // A handful of renders is mounting twice; a loop is hundreds, and React throws.
    expect(renders).toBeLessThan(12)
    expect(screen.getByTestId('others').textContent).toBe('')
  })

  it('shows a chip for the other person, and none for you', () => {
    open()
    const before = renders

    act(() => socket().deliver({ t: 'presence', room: ROOM, users: [MARCO, ME] }))

    expect(screen.getByTestId('others').textContent).toBe('Marco Rossi')
    const chips = screen.getAllByTestId('presence-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].textContent).toBe('MR')
    expect(renders - before).toBeLessThan(6)
  })

  it('takes the chip away when they leave', () => {
    open()
    act(() => socket().deliver({ t: 'presence', room: ROOM, users: [MARCO, ME] }))
    act(() => socket().deliver({ t: 'presence', room: ROOM, users: [ME] }))
    expect(screen.queryByTestId('presence-chip')).toBeNull()
  })
})
