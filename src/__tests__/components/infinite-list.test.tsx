/**
 * A list that loads more as it scrolls (components/infinite-list).
 *
 * What a person notices: rows arrive as the end of the list comes near, the
 * count says how many are on screen, no row ever shows twice, a batch that
 * fails says so quietly and comes back on Retry, and another filter starts
 * over at the top of the new list.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InfiniteListCount,
  InfiniteListFooter,
} from '@/components/infinite-list/infinite-list-footer'
import {
  type InfinitePage,
  type ServerBatch,
  useInfiniteRows,
} from '@/components/infinite-list/use-infinite-rows'
import type { ActionResult } from '@/lib/with-auth'

type Row = { id: string; name: string }
type Page = InfinitePage<Row, number>

// The end of the list coming into sight is an IntersectionObserver's call.
const observers: { callback: IntersectionObserverCallback; observer: IntersectionObserver }[] = []
class FakeObserver {
  constructor(public callback: IntersectionObserverCallback) {
    observers.push({ callback, observer: this as unknown as IntersectionObserver })
  }
  observe() {
    // Nothing to watch: the test says when the end is in sight.
  }
  unobserve() {
    // As above.
  }
  disconnect() {
    // As above.
  }
  takeRecords() {
    return []
  }
}

function endInSight(near: boolean) {
  act(() => {
    for (const { callback, observer } of observers) {
      callback([{ isIntersecting: near } as IntersectionObserverEntry], observer)
    }
  })
}

function rowsOf(prefix: string, count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    name: `${prefix} job ${i + 1}`,
  }))
}

/** A list of `all` rows served in batches of 50, the cursor being where the last batch ended. */
function server(all: Row[]) {
  return vi.fn(async (cursor: number | null): Promise<ActionResult<Page>> => {
    const start = cursor ?? 0
    const rows = all.slice(start, start + 50)
    const end = start + rows.length
    return {
      success: true,
      data: { rows, nextCursor: end < all.length ? end : null, total: all.length },
    }
  })
}

/** The first batch as one server render of the page hands it over. */
function firstBatch(all: Row[], renderId = 'render-1'): ServerBatch<Page> {
  return {
    rows: all.slice(0, 50),
    nextCursor: all.length > 50 ? 50 : null,
    total: all.length,
    renderId,
  }
}

function Harness({
  filter,
  initial,
  fetchPage,
}: {
  filter: string
  initial: ServerBatch<Page>
  fetchPage: (cursor: number | null) => Promise<ActionResult<Page>>
}) {
  const list = useInfiniteRows<Row, number, Page>({
    queryKey: ['jobs', filter],
    initial,
    fetchPage,
  })
  return (
    <>
      <InfiniteListCount shown={list.rows.length} total={list.total} />
      <div style={{ overflowY: 'auto' }}>
        <ul>
          {list.rows.map((row) => (
            <li key={row.id}>{row.name}</li>
          ))}
        </ul>
        <InfiniteListFooter state={list} />
      </div>
    </>
  )
}

let client: QueryClient
function show(props: Parameters<typeof Harness>[0]) {
  const view = render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>
  )
  return {
    ...view,
    rerender: (next: Parameters<typeof Harness>[0]) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <Harness {...next} />
        </QueryClientProvider>
      ),
  }
}

beforeEach(() => {
  observers.length = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  client.clear()
})

describe('loading more as the list scrolls', () => {
  it('shows the server batch at once and appends the next as the end comes near', async () => {
    const all = rowsOf('a', 120)
    const fetchPage = server(all)
    show({ filter: 'one', initial: firstBatch(all), fetchPage })

    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    expect(screen.getByText('50 of 120')).toBeInTheDocument()
    expect(fetchPage).not.toHaveBeenCalled()

    endInSight(true)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(100))
    // The end is still in sight after the batch landed, so the last one follows.
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(120))
    expect(screen.getByText('120 results')).toBeInTheDocument()
    expect(screen.getByText('All 120 shown')).toBeInTheDocument()
  })

  it('asks for nothing more once the end is out of sight', async () => {
    const all = rowsOf('a', 200)
    const serve = server(all)
    let open: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })
    const fetchPage = vi.fn(async (cursor: number | null) => {
      await gate
      return serve(cursor)
    })
    show({ filter: 'one', initial: firstBatch(all), fetchPage })

    endInSight(true)
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1))
    // Scrolled back up before the batch arrived.
    endInSight(false)
    open()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(100))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('listitem')).toHaveLength(100)
  })

  it('never shows a row twice when a batch overlaps the one before it', async () => {
    const all = rowsOf('a', 80)
    // A job added at the top while scrolling pushes the last row of the first
    // batch into the second one.
    const fetchPage = vi.fn(
      async (): Promise<ActionResult<Page>> => ({
        success: true,
        data: { rows: all.slice(49, 80), nextCursor: null },
      })
    )
    show({ filter: 'one', initial: firstBatch(all), fetchPage })

    endInSight(true)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(80))
    expect(screen.getAllByText('a job 50')).toHaveLength(1)
  })

  it('says quietly when a batch failed, and loads it on Retry', async () => {
    const all = rowsOf('a', 80)
    const working = server(all)
    const fetchPage = vi
      .fn<(cursor: number | null) => Promise<ActionResult<Page>>>()
      // The first try and its quiet second try both fail.
      .mockResolvedValueOnce({ success: false, error: 'offline' })
      .mockResolvedValueOnce({ success: false, error: 'offline' })
      .mockImplementation(working)
    show({ filter: 'one', initial: firstBatch(all), fetchPage })

    endInSight(true)
    expect(await screen.findByText("Couldn't load more", {}, { timeout: 3000 })).toBeInTheDocument()
    // The rows already shown stay.
    expect(screen.getAllByRole('listitem')).toHaveLength(50)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(80))
    expect(screen.queryByText("Couldn't load more")).not.toBeInTheDocument()
  })

  it('survives an action that cannot reach the server', async () => {
    const all = rowsOf('a', 80)
    const fetchPage = vi.fn(async (): Promise<ActionResult<Page>> => {
      throw new Error('Failed to fetch')
    })
    show({ filter: 'one', initial: firstBatch(all), fetchPage })

    endInSight(true)
    expect(await screen.findByText("Couldn't load more", {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(50)
  })
})

describe('another filter', () => {
  it('starts over at the first batch of the new list', async () => {
    const all = rowsOf('a', 120)
    const view = show({ filter: 'one', initial: firstBatch(all), fetchPage: server(all) })
    endInSight(true)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(120))

    const other = rowsOf('b', 70)
    endInSight(false)
    view.rerender({ filter: 'two', initial: firstBatch(other), fetchPage: server(other) })

    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    expect(screen.getByText('b job 1')).toBeInTheDocument()
    expect(screen.queryByText('a job 1')).not.toBeInTheDocument()
    expect(screen.getByText('50 of 70')).toBeInTheDocument()
  })

  it('does not load past the first batch of the new list on its own', async () => {
    // The old list was scrolled to its end; the new one opens at its top.
    const all = rowsOf('a', 120)
    const view = show({ filter: 'one', initial: firstBatch(all), fetchPage: server(all) })
    endInSight(true)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(120))

    const other = rowsOf('b', 170)
    const fetchOther = server(other)
    view.rerender({ filter: 'two', initial: firstBatch(other), fetchPage: fetchOther })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchOther).not.toHaveBeenCalled()
    expect(screen.getAllByRole('listitem')).toHaveLength(50)
  })

  it('going back to an earlier filter shows its first batch, not where it was left', async () => {
    const all = rowsOf('a', 120)
    const other = rowsOf('b', 70)
    const view = show({ filter: 'one', initial: firstBatch(all), fetchPage: server(all) })
    endInSight(true)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(120))
    endInSight(false)
    view.rerender({ filter: 'two', initial: firstBatch(other), fetchPage: server(other) })
    view.rerender({ filter: 'one', initial: firstBatch(all), fetchPage: server(all) })

    expect(screen.getAllByRole('listitem')).toHaveLength(50)
  })
})

/**
 * A page that shows placeholders in the list's box while a search loads (the
 * vehicles grid): the footer goes away with the rows, the box stays.
 */
function PlaceholderHarness({
  filter,
  initial,
  fetchPage,
  loading,
}: Parameters<typeof Harness>[0] & { loading: boolean }) {
  const list = useInfiniteRows<Row, number, Page>({
    queryKey: ['jobs', filter],
    initial,
    fetchPage,
  })
  return (
    <div data-testid="box" style={{ overflowY: 'auto' }}>
      {loading ? (
        <p>Loading</p>
      ) : (
        <>
          <ul>
            {list.rows.map((row) => (
              <li key={row.id}>{row.name}</li>
            ))}
          </ul>
          <InfiniteListFooter state={list} />
        </>
      )}
    </div>
  )
}

describe('a search behind placeholders', () => {
  function showWithPlaceholders(props: Parameters<typeof PlaceholderHarness>[0]) {
    const tree = (next: typeof props) => (
      <QueryClientProvider client={client}>
        <PlaceholderHarness {...next} />
      </QueryClientProvider>
    )
    const view = render(tree(props))
    const box = screen.getByTestId('box')
    // jsdom does not scroll; the box keeps whatever it is told.
    Object.defineProperty(box, 'scrollTop', { value: 0, writable: true, configurable: true })
    return { box, rerender: (next: typeof props) => view.rerender(tree(next)) }
  }

  it('opens the new list at its top, not where the old one was scrolled', () => {
    const all = rowsOf('a', 120)
    const other = rowsOf('b', 70)
    const view = showWithPlaceholders({
      filter: 'one',
      initial: firstBatch(all),
      fetchPage: server(all),
      loading: false,
    })
    view.box.scrollTop = 1000

    view.rerender({
      filter: 'one',
      initial: firstBatch(all),
      fetchPage: server(all),
      loading: true,
    })
    view.rerender({
      filter: 'two',
      initial: firstBatch(other),
      fetchPage: server(other),
      loading: false,
    })

    expect(screen.getByText('b job 1')).toBeInTheDocument()
    expect(view.box.scrollTop).toBe(0)
  })

  it('leaves the same list where it was', () => {
    const all = rowsOf('a', 120)
    const view = showWithPlaceholders({
      filter: 'one',
      initial: firstBatch(all),
      fetchPage: server(all),
      loading: false,
    })
    view.box.scrollTop = 1000

    view.rerender({
      filter: 'one',
      initial: firstBatch(all),
      fetchPage: server(all),
      loading: true,
    })
    view.rerender({
      filter: 'one',
      initial: firstBatch(all),
      fetchPage: server(all),
      loading: false,
    })

    expect(view.box.scrollTop).toBe(1000)
  })
})

describe('the same list changing', () => {
  it('shows a changed first batch at once and keeps the rows loaded after it', async () => {
    const all = rowsOf('a', 120)
    const fetchPage = server(all)
    const view = show({ filter: 'one', initial: firstBatch(all), fetchPage })
    endInSight(true)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(120))
    endInSight(false)

    // An edit elsewhere; the server page re-renders with the new first batch.
    all[0] = { id: 'a1', name: 'a job 1, renamed' }
    view.rerender({ filter: 'one', initial: firstBatch(all, 'render-2'), fetchPage })

    expect(screen.getByText('a job 1, renamed')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(120))
  })

  it('re-reads the later batches after a refresh, even when the first batch is the same', async () => {
    const all = rowsOf('a', 120)
    const fetchPage = server(all)
    const view = show({ filter: 'one', initial: firstBatch(all), fetchPage })
    endInSight(true)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(120))
    endInSight(false)

    // A row in the second batch is edited and saved; the form calls
    // router.refresh() and the page renders again with the same first batch.
    all[69] = { id: 'a70', name: 'a job 70, edited' }
    view.rerender({ filter: 'one', initial: firstBatch(all, 'render-2'), fetchPage })

    expect(await screen.findByText('a job 70, edited')).toBeInTheDocument()
    expect(screen.queryByText('a job 70')).not.toBeInTheDocument()
    // Nothing went missing while it was re-read.
    expect(screen.getAllByRole('listitem')).toHaveLength(120)
  })

  it('reads nothing on a client re-render or Back to a page the router kept', async () => {
    const all = rowsOf('a', 120)
    const fetchPage = server(all)
    const view = show({ filter: 'one', initial: firstBatch(all), fetchPage })
    endInSight(true)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(120))
    endInSight(false)
    const calls = fetchPage.mock.calls.length

    // A parent re-rendering hands over a copy of the same render.
    view.rerender({ filter: 'one', initial: firstBatch(all), fetchPage })
    // Leaving and pressing Back mounts the list again with that render.
    view.unmount()
    show({ filter: 'one', initial: firstBatch(all), fetchPage })

    expect(screen.getAllByRole('listitem')).toHaveLength(120)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchPage).toHaveBeenCalledTimes(calls)
  })
})

describe('the wait for a batch', () => {
  it('shows placeholders only when the batch is slow', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const all = rowsOf('a', 80)
      let answer: (value: ActionResult<Page>) => void = () => undefined
      const fetchPage = vi.fn(
        () =>
          new Promise<ActionResult<Page>>((resolve) => {
            answer = resolve
          })
      )
      const { container } = show({ filter: 'one', initial: firstBatch(all), fetchPage })
      endInSight(true)
      await waitFor(() => expect(fetchPage).toHaveBeenCalled())
      expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)

      await act(async () => {
        vi.advanceTimersByTime(350)
      })
      expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)

      await act(async () => {
        answer({ success: true, data: { rows: all.slice(50), nextCursor: null } })
      })
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(80))
      expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
