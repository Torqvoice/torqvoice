import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const getMemberSeats = vi.fn()
vi.mock('@/features/team/Actions/getMemberSeats', () => ({
  getMemberSeats: () => getMemberSeats(),
}))
const inviteMember = vi.fn()
vi.mock('@/features/team/Actions/teamActions', () => ({
  inviteMember: (input: unknown) => inviteMember(input),
}))
const handleGated = vi.fn((_result: unknown) => true)
vi.mock('@/components/upgrade-gate', () => ({
  handleGated: (result: unknown) => handleGated(result),
}))
vi.mock('@/features/team/Actions/createAppSetupCode', () => ({
  createAppSetupCode: vi.fn(),
  revokeAppSetupCode: vi.fn(),
}))
vi.mock('@/features/team/Actions/createTechnicianAccount', () => ({
  createTechnicianAccount: vi.fn(),
  getWorkshopDialCode: vi.fn(),
}))
vi.mock('@/features/workboard/Actions/technicianActions', () => ({ createTechnician: vi.fn() }))
vi.mock('@/features/team/Actions/getRoles', () => ({ getRoles: vi.fn() }))
vi.mock('@/features/team/Actions/createDefaultRoles', () => ({ createDefaultRoles: vi.fn() }))
vi.mock('@/features/team/hooks/useTechnicianConnected', () => ({
  useTechnicianConnected: vi.fn(),
}))

import { AddPersonDialog } from '@/features/team/Components/AddPersonDialog'

const OFFICE = 'Someone in the office'

function dialog(open = true) {
  return (
    <AddPersonDialog
      open={open}
      onOpenChange={vi.fn()}
      dialCode="+47"
      roles={[{ id: 'role-desk', name: 'Desk' }]}
      onChanged={vi.fn()}
    />
  )
}

function renderDialog() {
  return render(dialog())
}

function officeChoice() {
  return screen.getByRole('button', { name: new RegExp(OFFICE) })
}

/**
 * Picks a role by the name a person reads in the list. The list itself opens
 * in a popper jsdom cannot lay out, so the choice goes through the native
 * select the form control keeps in step with it.
 */
function chooseRole(name: string) {
  const native = document.querySelector('select')
  const option = Array.from(native?.options ?? []).find((o) => o.textContent === name)
  if (!native || !option) throw new Error(`The role list has no "${name}"`)
  fireEvent.change(native, { target: { value: option.value } })
}

describe('AddPersonDialog, office seats', () => {
  beforeEach(() => {
    getMemberSeats.mockReset()
    inviteMember.mockReset()
    handleGated.mockClear()
  })

  it('says the plan is full before any address is typed, and offers the upgrade', async () => {
    getMemberSeats.mockResolvedValue({ success: true, data: { used: 1, limit: 1, full: true } })
    renderDialog()

    await waitFor(() => expect(officeChoice()).toHaveAttribute('data-locked', 'true'))
    expect(officeChoice()).toHaveTextContent(
      'Your plan includes one team member. Upgrade to invite more people.'
    )

    fireEvent.click(officeChoice())
    expect(handleGated).toHaveBeenCalledWith({ gated: { feature: 'maxUsers', limit: 1 } })
    expect(screen.queryByLabelText('Invite by Email')).toBeNull()
  })

  it('opens the invite form while a seat is free', async () => {
    getMemberSeats.mockResolvedValue({ success: true, data: { used: 1, limit: 5, full: false } })
    renderDialog()
    await waitFor(() => expect(getMemberSeats).toHaveBeenCalled())

    fireEvent.click(officeChoice())
    expect(handleGated).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Invite by Email')).toBeInTheDocument()
  })

  it('still opens the form when the seat answer has not arrived', () => {
    // An answer that never arrives
    getMemberSeats.mockReturnValue(new Promise(vi.fn()))
    renderDialog()

    fireEvent.click(officeChoice())
    expect(screen.getByLabelText('Invite by Email')).toBeInTheDocument()
  })

  it('forgets a full plan between openings when the new answer fails', async () => {
    getMemberSeats.mockResolvedValueOnce({
      success: true,
      data: { used: 1, limit: 1, full: true },
    })
    const { rerender } = renderDialog()
    await waitFor(() => expect(officeChoice()).toHaveAttribute('data-locked', 'true'))

    // A member was removed meanwhile; this time the seat check itself fails
    getMemberSeats.mockResolvedValueOnce({ success: false, error: 'Network error' })
    rerender(dialog(false))
    rerender(dialog(true))
    await waitFor(() => expect(getMemberSeats).toHaveBeenCalledTimes(2))

    expect(officeChoice()).not.toHaveAttribute('data-locked')
    fireEvent.click(officeChoice())
    expect(handleGated).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Invite by Email')).toBeInTheDocument()
  })
})

describe('AddPersonDialog, invite address', () => {
  beforeEach(() => {
    getMemberSeats.mockReset()
    getMemberSeats.mockResolvedValue({ success: true, data: { used: 1, limit: 5, full: false } })
    inviteMember.mockReset()
    inviteMember.mockResolvedValue({ success: true, data: { invited: true } })
  })

  async function openForm() {
    renderDialog()
    await waitFor(() => expect(getMemberSeats).toHaveBeenCalled())
    fireEvent.click(officeChoice())
    return screen.getByLabelText('Invite by Email')
  }

  it('refuses an address the server would refuse, in words, without asking it', async () => {
    const field = await openForm()
    // The browser's type="email" lets this through; the server does not
    fireEvent.change(field, { target: { value: 'kari@gmail' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))

    expect(
      await screen.findByText('Check the email address. It should look like name@example.com.')
    ).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    // Announced, and read out with the field, since the browser says nothing
    const message = screen.getByRole('alert')
    expect(message).toHaveTextContent('Check the email address.')
    expect(field).toHaveAttribute('aria-describedby', message.id)
    expect(inviteMember).not.toHaveBeenCalled()
  })

  it('clears the message once the address is being corrected', async () => {
    const field = await openForm()
    fireEvent.change(field, { target: { value: 'kari@gmail' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    await screen.findByText(/Check the email address/)

    fireEvent.change(field, { target: { value: 'kari@gmail.com' } })
    expect(screen.queryByText(/Check the email address/)).toBeNull()
  })

  it('sends a good address on to the invite action', async () => {
    const field = await openForm()
    fireEvent.change(field, { target: { value: ' kari@gmail.com ' } })
    chooseRole('Desk')
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))

    await waitFor(() =>
      expect(inviteMember).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'kari@gmail.com' })
      )
    )
  })
})

describe('AddPersonDialog, the role of someone invited', () => {
  beforeEach(() => {
    getMemberSeats.mockReset()
    getMemberSeats.mockResolvedValue({ success: true, data: { used: 1, limit: 5, full: false } })
    inviteMember.mockReset()
    inviteMember.mockResolvedValue({ success: true, data: { invited: true } })
  })

  async function openForm() {
    renderDialog()
    await waitFor(() => expect(getMemberSeats).toHaveBeenCalled())
    fireEvent.click(officeChoice())
    fireEvent.change(screen.getByLabelText('Invite by Email'), {
      target: { value: 'kari@gmail.com' },
    })
  }

  it('starts with no role chosen, not with No role', async () => {
    await openForm()
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose a role')
    expect(screen.getByRole('combobox')).not.toHaveTextContent('No role')
  })

  it('does not send an invitation until a role is chosen, and says so', async () => {
    // The person who joined a workshop and met "No access yet" was invited
    // by someone who never touched this field
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))

    const message = await screen.findByRole('alert')
    expect(message).toHaveTextContent(
      'Choose a role before inviting. Someone with no role can sign in but cannot open anything.'
    )
    const picker = screen.getByRole('combobox')
    expect(picker).toHaveAttribute('aria-invalid', 'true')
    expect(picker).toHaveAttribute('aria-describedby', message.id)
    expect(inviteMember).not.toHaveBeenCalled()
  })

  it('drops the message once a role is chosen, and invites with that role', async () => {
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    await screen.findByRole('alert')

    chooseRole('Desk')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('combobox')).toHaveTextContent('Desk')

    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    await waitFor(() =>
      expect(inviteMember).toHaveBeenCalledWith({
        email: 'kari@gmail.com',
        role: 'member',
        roleId: 'role-desk',
      })
    )
  })

  it('invites an admin as an admin', async () => {
    await openForm()
    chooseRole('Admin')
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))

    await waitFor(() =>
      expect(inviteMember).toHaveBeenCalledWith({
        email: 'kari@gmail.com',
        role: 'admin',
        roleId: undefined,
      })
    )
  })

  it('still invites with no role when that is chosen on purpose, and says what it means', async () => {
    await openForm()
    chooseRole('No role')
    expect(screen.getByRole('combobox')).toHaveTextContent('No role')
    expect(
      screen.getByText(
        'They can sign in, but they cannot open anything until an owner or an admin gives them a role.'
      )
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    await waitFor(() =>
      expect(inviteMember).toHaveBeenCalledWith({
        email: 'kari@gmail.com',
        role: 'member',
        roleId: undefined,
      })
    )
  })
})
