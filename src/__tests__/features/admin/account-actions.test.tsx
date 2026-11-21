/**
 * The platform admin's account list and the actions on one account, as the
 * admin meets them on a phone: nothing in the list changes an account, and
 * the two actions that cannot be taken lightly stay dead until the account's
 * email has been typed.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const deletePlatformUser = vi.fn()
const grantSuperAdmin = vi.fn()
const revokeSuperAdmin = vi.fn()
vi.mock('@/features/admin/Actions/deletePlatformUser', () => ({
  deletePlatformUser: (input: unknown) => deletePlatformUser(input),
}))
vi.mock('@/features/admin/Actions/grantSuperAdmin', () => ({
  grantSuperAdmin: (input: unknown) => grantSuperAdmin(input),
}))
vi.mock('@/features/admin/Actions/revokeSuperAdmin', () => ({
  revokeSuperAdmin: (input: unknown) => revokeSuperAdmin(input),
}))

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  usePathname: () => '/admin/users',
  useSearchParams: () => new URLSearchParams(),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

const { ConfirmProvider } = await import('@/components/confirm-dialog')
const { AccountActions } = await import('@/features/admin/Components/AccountActions')
const { AdminUsers } = await import('@/features/admin/Components/admin-users')

const ola = {
  id: 'user-ola',
  name: 'Ola Nordmann',
  email: 'ola@nordmann-bil.example',
  isSuperAdmin: false,
  isSelf: false,
  organizations: [
    { id: 'org-1', name: 'Nordmann Bil AS', memberCount: 1 },
    { id: 'org-2', name: 'Fjord Marine', memberCount: 4 },
  ],
}

function renderActions(user = ola) {
  const actor = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <ConfirmProvider>
      <AccountActions user={user} />
    </ConfirmProvider>
  )
  return actor
}

beforeEach(() => {
  for (const mock of [
    deletePlatformUser,
    grantSuperAdmin,
    revokeSuperAdmin,
    push,
    refresh,
    toastSuccess,
    toastError,
  ]) {
    mock.mockReset()
  }
  deletePlatformUser.mockResolvedValue({ success: true, data: { deleted: true } })
  grantSuperAdmin.mockResolvedValue({ success: true })
  revokeSuperAdmin.mockResolvedValue({ success: true })
})

describe('the account list', () => {
  const row = {
    id: 'user-ola',
    name: 'Ola Nordmann',
    email: 'ola@nordmann-bil.example',
    isSuperAdmin: false,
    emailVerified: true,
    createdAt: '2026-03-12T10:00:00.000Z',
    lastSeen: null,
    organizationCount: 1,
  }

  it('offers nothing that changes an account, and a tap only opens it', async () => {
    const actor = userEvent.setup({ pointerEventsCheck: 0 })
    render(
      <ConfirmProvider>
        <AdminUsers
          data={{ users: [row], total: 1, page: 1, pageSize: 20, totalPages: 1 }}
          search=""
          sortBy="lastSeen"
          sortOrder="desc"
        />
      </ConfirmProvider>
    )

    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/make super admin/i)).not.toBeInTheDocument()

    // Every place the account shows: the phone card and the table row.
    for (const name of screen.getAllByText('Ola Nordmann')) {
      await actor.click(name)
    }

    expect(push).toHaveBeenCalledWith('/admin/users/user-ola')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deletePlatformUser).not.toHaveBeenCalled()
    expect(grantSuperAdmin).not.toHaveBeenCalled()
    expect(revokeSuperAdmin).not.toHaveBeenCalled()
  })
})

describe('deleting an account', () => {
  it('names the account and what goes with it, and waits for the email', async () => {
    const actor = renderActions()
    await actor.click(screen.getByRole('button', { name: 'Delete user' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Ola Nordmann')).toBeInTheDocument()
    expect(within(dialog).getAllByText('ola@nordmann-bil.example').length).toBeGreaterThan(0)
    expect(
      within(dialog).getByText(
        'Nordmann Bil AS has no other members and is deleted with all its data.'
      )
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/Fjord Marine has no other members/)).not.toBeInTheDocument()
    expect(within(dialog).getByText('This cannot be undone.')).toBeInTheDocument()

    const confirmButton = within(dialog).getByRole('button', { name: 'Delete user' })
    expect(confirmButton).toBeDisabled()

    // A second tap where the first one landed does nothing.
    await actor.click(confirmButton)
    expect(deletePlatformUser).not.toHaveBeenCalled()

    const input = within(dialog).getByRole('textbox')
    await actor.type(input, 'ola@nordmann')
    expect(confirmButton).toBeDisabled()
    await actor.keyboard('{Enter}')
    expect(deletePlatformUser).not.toHaveBeenCalled()

    await actor.type(input, '-bil.example')
    expect(confirmButton).toBeEnabled()
    await actor.click(confirmButton)

    await waitFor(() =>
      expect(deletePlatformUser).toHaveBeenCalledWith({
        userId: 'user-ola',
        confirmEmail: 'ola@nordmann-bil.example',
      })
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/users'))
  })

  it('deletes nobody when the dialog is cancelled', async () => {
    const actor = renderActions()
    await actor.click(screen.getByRole('button', { name: 'Delete user' }))
    const dialog = await screen.findByRole('alertdialog')
    await actor.type(within(dialog).getByRole('textbox'), 'ola@nordmann-bil.example')
    await actor.click(within(dialog).getByRole('button', { name: /Cancel/ }))

    expect(deletePlatformUser).not.toHaveBeenCalled()
  })

  it('says why when the server refuses', async () => {
    deletePlatformUser.mockResolvedValue({ success: false, error: 'This user no longer exists.' })
    const actor = renderActions()
    await actor.click(screen.getByRole('button', { name: 'Delete user' }))
    const dialog = await screen.findByRole('alertdialog')
    await actor.type(within(dialog).getByRole('textbox'), 'ola@nordmann-bil.example')
    await actor.click(within(dialog).getByRole('button', { name: 'Delete user' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('This user no longer exists.'))
    expect(push).not.toHaveBeenCalled()
  })

  it('is not offered for a super admin until that is removed', () => {
    renderActions({ ...ola, isSuperAdmin: true })
    expect(screen.getByRole('button', { name: 'Delete user' })).toBeDisabled()
    expect(screen.getByText('Remove super admin first')).toBeInTheDocument()
  })
})

describe('super admin access', () => {
  it('is granted only after the email is typed', async () => {
    const actor = renderActions()
    await actor.click(screen.getByRole('button', { name: 'Make super admin' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Ola Nordmann')).toBeInTheDocument()
    const confirmButton = within(dialog).getByRole('button', { name: 'Make super admin' })
    expect(confirmButton).toBeDisabled()
    await actor.click(confirmButton)
    expect(grantSuperAdmin).not.toHaveBeenCalled()

    await actor.type(within(dialog).getByRole('textbox'), 'ola@nordmann-bil.example')
    await actor.click(confirmButton)

    await waitFor(() =>
      expect(grantSuperAdmin).toHaveBeenCalledWith({
        userId: 'user-ola',
        confirmEmail: 'ola@nordmann-bil.example',
      })
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('is removed after a question that opens on Cancel', async () => {
    const actor = renderActions({ ...ola, isSuperAdmin: true })
    await actor.click(screen.getByRole('button', { name: 'Remove super admin' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Ola Nordmann')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Cancel/ })).toHaveFocus()

    // Enter presses the button that has focus: the safe one.
    await actor.keyboard('{Enter}')
    expect(revokeSuperAdmin).not.toHaveBeenCalled()

    await actor.click(screen.getByRole('button', { name: 'Remove super admin' }))
    const again = await screen.findByRole('alertdialog')
    await actor.click(within(again).getByRole('button', { name: 'Remove super admin' }))
    await waitFor(() => expect(revokeSuperAdmin).toHaveBeenCalledWith({ userId: 'user-ola' }))
  })
})

describe('your own account', () => {
  it('has no actions at all', () => {
    renderActions({ ...ola, isSelf: true, isSuperAdmin: true })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(
      screen.getByText('This is your own account. Another super admin has to change it.')
    ).toBeInTheDocument()
  })
})
