/**
 * Fetch, next to the supplier link on the part form, is a convenience: the
 * server reads the supplier's page and prefills the fields. Some suppliers
 * sit behind a bot check and turn that read away.
 *
 * Two people met an error dialog titled "Fetch Failed" there, pressed Fetch
 * again and again, and concluded the part could not be saved. Saving was
 * never blocked. A lookup that finds nothing now says so under the link, in
 * the user's language, and says that the part still saves.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The form asks whether this is a touch device; jsdom has no matchMedia.
// biome-ignore lint/suspicious/noEmptyBlockStatements: a stub that listens to nothing
const noop = () => {}
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: noop,
  removeEventListener: noop,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() },
}))

const createInventoryPart = vi.fn()
vi.mock('@/features/inventory/Actions/inventoryActions', () => ({
  createInventoryPart: (input: unknown) => createInventoryPart(input),
  updateInventoryPart: vi.fn(),
  deleteOrphanedUploads: vi.fn(),
}))
vi.mock('@/features/inventory/Actions/aiAnalyzePartImage', () => ({
  aiAnalyzePartImage: vi.fn(),
}))

import { GlassModal, useGlassModal } from '@/components/glass-modal'
import { InventoryPartForm } from '@/features/inventory/Components/InventoryPartForm'

const LINK = 'https://supplier.example/parts/brake-pad'

const BLOCKED =
  "This supplier's site blocks automatic lookup. Fill in the fields yourself. The part and the link still save."
const TIMED_OUT =
  "The supplier's site took too long to answer. Try again, or fill in the fields yourself. The part and the link still save."
const UNREADABLE =
  'Could not read the part details from this link. Fill in the fields yourself. The part and the link still save.'

/** What the lookup route answers when Cloudflare challenges the server. */
const BOT_PROTECTED = {
  code: 'bot_protected',
  error: 'This site has bot protection. Please fill in the fields manually.',
}

const lookup = vi.fn()

function answer(status: number, body: unknown) {
  lookup.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

/** The form with the app's error dialog mounted beside it, as in the real shell. */
function renderForm() {
  const onOpenChange = vi.fn()
  render(
    <>
      <InventoryPartForm open onOpenChange={onOpenChange} />
      <GlassModal />
    </>
  )
  return { onOpenChange }
}

function typeLink(value: string) {
  fireEvent.change(screen.getByLabelText('Supplier Link'), { target: { value } })
}

function fetchButton() {
  return screen.getByRole('button', { name: 'Fetch' })
}

function fetchFrom(link: string) {
  typeLink(link)
  fireEvent.click(fetchButton())
}

beforeEach(() => {
  lookup.mockReset()
  createInventoryPart.mockReset()
  vi.stubGlobal('fetch', lookup)
  // The error dialog is one store for the whole app; start each test with it shut.
  useGlassModal.getState().close()
})

describe('Fetch on a supplier link that turns the lookup away', () => {
  it('says so under the link, opens no error dialog, and the part still saves', async () => {
    answer(422, BOT_PROTECTED)
    createInventoryPart.mockResolvedValue({ success: true })
    const { onOpenChange } = renderForm()

    fetchFrom(LINK)

    expect(await screen.findByText(BLOCKED)).toBeInTheDocument()
    // The form is still the only dialog: nothing opened over it, and the
    // server's English sentence is not what the user reads.
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Add New Part' })).toBeInTheDocument()
    expect(screen.queryByText(BOT_PROTECTED.error)).toBeNull()

    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Brake pad front' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Part' }))

    await waitFor(() =>
      expect(createInventoryPart).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Brake pad front', supplierUrl: LINK })
      )
    )
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('stops Fetch for that link, and lets it go again once the link is edited', async () => {
    answer(422, BOT_PROTECTED)
    renderForm()

    fetchFrom(LINK)

    expect(await screen.findByText(BLOCKED)).toBeInTheDocument()
    expect(fetchButton()).toBeDisabled()

    typeLink('https://other-supplier.example/parts/brake-pad')

    expect(screen.queryByText(BLOCKED)).toBeNull()
    expect(fetchButton()).toBeEnabled()
  })
})

describe('Fetch that finds nothing for another reason', () => {
  const answers: [why: string, body: unknown, note: string][] = [
    ['the supplier answers too slowly', { code: 'timeout', error: 'Request timed out' }, TIMED_OUT],
    [
      'the supplier answers with an error',
      { code: 'http_error', error: 'Failed to fetch URL (503)' },
      UNREADABLE,
    ],
    ['the answer names no reason', {}, UNREADABLE],
  ]

  it.each(answers)('says so under the link when %s', async (_why, body, note) => {
    answer(422, body)
    renderForm()

    fetchFrom(LINK)

    expect(await screen.findByText(note)).toBeInTheDocument()
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1)
    // Unlike a site that blocks the lookup, these may answer the next time.
    expect(fetchButton()).toBeEnabled()
  })

  it('says so under the link when the request never reaches the server', async () => {
    lookup.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderForm()

    fetchFrom(LINK)

    expect(await screen.findByText(UNREADABLE)).toBeInTheDocument()
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1)
  })

  it('takes the note away once a later fetch reads the page', async () => {
    answer(422, { code: 'http_error', error: 'Failed to fetch URL (503)' })
    renderForm()

    fetchFrom(LINK)
    expect(await screen.findByText(UNREADABLE)).toBeInTheDocument()

    answer(200, { name: 'Brake pad front' })
    fireEvent.click(fetchButton())

    await waitFor(() => expect(screen.getByLabelText('Name *')).toHaveValue('Brake pad front'))
    expect(screen.queryByText(UNREADABLE)).toBeNull()
  })
})

describe('A supplier link typed without https://', () => {
  const TYPED = 'www.supplier.example/parts/brake-pad'
  const NORMALISED = 'https://www.supplier.example/parts/brake-pad'

  /** Answers the way the real action does: the server schema checks the input first. */
  async function saveLikeTheServer(input: unknown) {
    const { createInventoryPartSchema } = await import(
      '@/features/inventory/Schema/inventorySchema'
    )
    const parsed = createInventoryPartSchema.safeParse(input)
    if (parsed.success) return { success: true }
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('. ')
    return { success: false, error: message }
  }

  function save(name: string) {
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: name } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Part' }))
  }

  it('is looked up as an https:// link, and the field shows it', async () => {
    answer(200, { name: 'Brake pad front' })
    renderForm()

    fetchFrom(TYPED)

    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1))
    const [, init] = lookup.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ url: NORMALISED })
    expect(screen.getByLabelText('Supplier Link')).toHaveValue(NORMALISED)
    await waitFor(() => expect(screen.getByLabelText('Name *')).toHaveValue('Brake pad front'))
  })

  it('saves with https:// in front', async () => {
    createInventoryPart.mockImplementation(saveLikeTheServer)
    const { onOpenChange } = renderForm()

    typeLink(TYPED)
    save('Brake pad front')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(createInventoryPart).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Brake pad front', supplierUrl: NORMALISED })
    )
    expect(screen.queryByText(/Invalid URL/)).toBeNull()
  })

  it('says in plain words when what was typed is not a link', async () => {
    createInventoryPart.mockImplementation(saveLikeTheServer)
    const { onOpenChange } = renderForm()

    typeLink('ask at the counter')
    save('Brake pad front')

    expect(
      await screen.findByText(
        'The supplier link is not a web address. Correct it, or clear it to save without one.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/Invalid URL/)).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
